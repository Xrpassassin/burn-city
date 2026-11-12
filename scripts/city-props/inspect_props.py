"""Check shipped city props and inventory any downloaded Sketchfab GLBs."""
import argparse
import json
import struct
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
PACK = HERE.parents[1] / 'client/assets/props'


def load_glb(path):
    raw = path.read_bytes()
    if len(raw) < 20:
        raise ValueError('truncated GLB header')
    magic, version, length, chunk_size, chunk_type = struct.unpack_from('<4sIIII', raw)
    if (magic, version, length, chunk_type) != (b'glTF', 2, len(raw), 0x4E4F534A):
        raise ValueError('invalid GLB 2 header or JSON chunk')
    if chunk_size < 4 or chunk_size % 4 or chunk_size + 20 > len(raw):
        raise ValueError('invalid GLB JSON chunk length')
    return json.loads(raw[20:20 + chunk_size])


def describe(model):
    nodes = model.get('nodes', [])
    clips = []
    for clip in model.get('animations', []):
        tracks = sorted({
            (t['target']['node'], t['target']['path'])
            for t in clip.get('channels', []) if 'node' in t['target']
        })
        inputs = [model['accessors'][s['input']] for s in clip.get('samplers', [])]
        end = max((a['max'][0] for a in inputs if 'max' in a), default=None)
        clips.append({
            'name': clip.get('name'),
            'endTimeSeconds': end,
            'targets': [
                {'node': index, 'name': nodes[index].get('name'), 'path': path}
                for index, path in tracks
            ],
        })
    return {
        'meshNodes': [n.get('name', f'node {i}') for i, n in enumerate(nodes) if 'mesh' in n],
        'skinCount': len(model.get('skins', [])),
        'imageCount': len(model.get('images', [])),
        'clips': clips,
    }


def inspect_pack(prop_id, source, credits):
    model = json.loads((PACK / f'{prop_id}.gltf').read_text())
    meta = json.loads((PACK / f'{prop_id}.json').read_text())
    credit = credits[prop_id]
    if source['uid'] not in credit['url'] or credit['license'] != 'CC BY 4.0':
        raise ValueError('source UID or license differs from the shipped credit')
    report = describe(model)
    required = {
        'sliding-door': {'frame', 'panelA', 'panelB'},
        'pigeon': {'perch', 'flapUp', 'flapDown'},
    }.get(prop_id, {'body'})
    if not required.issubset(report['meshNodes']) or not required.issubset(meta['parts']):
        raise ValueError('missing runtime mesh parts')
    for asset in model.get('buffers', []) + model.get('images', []):
        uri = asset.get('uri')
        if not uri or uri.startswith('data:'):
            continue
        path = (PACK / uri).resolve()
        if not path.is_relative_to(PACK) or not path.is_file():
            raise ValueError(f'missing or invalid bundled dependency {uri}')
        if 'byteLength' in asset and path.stat().st_size != asset['byteLength']:
            raise ValueError(f'buffer byte length mismatch for {uri}')
    report['trianglesByPart'] = {part: details['tris'] for part, details in meta['parts'].items()}
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-dir', type=Path, help='Optional folder of <prop-id>.glb downloads')
    parser.add_argument('ids', nargs='*', help='Prop IDs from sources.json. Defaults to the full pack.')
    args = parser.parse_args()
    sources = json.loads((HERE / 'sources.json').read_text())
    credits = {p['id']: p for p in json.loads((PACK / 'props.json').read_text())['props']}
    for prop_id in args.ids:
        if prop_id not in sources:
            parser.error(f'unknown prop ID {prop_id!r}; choose from {", ".join(sources)}')
    results = {}
    failed = False
    for prop_id in args.ids or sources:
        source = sources[prop_id]
        report = {'uid': source['uid'], 'listedClips': source['anims']}
        results[prop_id] = report
        try:
            report['bundled'] = inspect_pack(prop_id, source, credits)
            if args.source_dir:
                glb = args.source_dir / f'{prop_id}.glb'
                report['source'] = describe(load_glb(glb))
        except (KeyError, IndexError, OSError, ValueError) as error:
            report['error'] = str(error)
            failed = True
    print(json.dumps(results, indent=2))
    return int(failed)


if __name__ == '__main__':
    sys.exit(main())
