"""Inspect local Sketchfab exports with Blender without changing the input files."""
import argparse
import json
from pathlib import Path
import sys

import bpy
from mathutils import Vector

HERE = Path(__file__).resolve().parent


def inspect(path, budget):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    result = bpy.ops.import_scene.gltf(filepath=str(path))
    if 'FINISHED' not in result:
        raise ValueError('Blender did not finish importing the model')
    scene = bpy.context.scene
    bpy.context.view_layer.update()
    meshes = [obj for obj in scene.objects if obj.type == 'MESH']
    if not meshes:
        raise ValueError('no mesh objects found')
    points = [obj.matrix_world @ Vector(corner) for obj in meshes for corner in obj.bound_box]
    bounds = {
        label: [round(reduce(point[i] for point in points), 4) for i in range(3)]
        for label, reduce in [('min', min), ('max', max)]
    }
    triangles = 0
    for obj in meshes:
        obj.data.calc_loop_triangles()
        triangles += len(obj.data.loop_triangles)
    images = [
        {'name': image.name, 'size': list(image.size)}
        for image in bpy.data.images if image.source != 'GENERATED'
    ]
    return {
        'bytes': path.stat().st_size,
        'boundsBlenderZUp': bounds,
        'triangles': triangles,
        'nodes': [
            {'name': obj.name, 'type': obj.type, 'parent': obj.parent.name if obj.parent else None}
            for obj in sorted(scene.objects, key=lambda item: item.name)
        ],
        'materials': sorted({mat.name for obj in meshes for mat in obj.data.materials if mat}),
        'actions': [
            {'name': action.name, 'frameRange': list(action.frame_range)}
            for action in bpy.data.actions
        ],
        'images': images,
        'exceedsPreviewBudget': {
            'triangles': triangles > budget['triangles'],
            'textureEdge': any(max(image['size']) > budget['textureEdge'] for image in images),
        },
    }


def main():
    sources = json.loads((HERE / 'sources.json').read_text())['assets']
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-dir', type=Path, required=True)
    parser.add_argument('--report', type=Path, required=True)
    parser.add_argument('ids', nargs='*', help='Model IDs from sources.json. Defaults to all entries in the manifest.')
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
    for asset_id in args.ids:
        if asset_id not in sources:
            parser.error(f'unknown asset ID {asset_id!r}; choose from {", ".join(sources)}')
    report = {}
    failed = False
    for asset_id in args.ids or sources:
        asset = sources[asset_id]
        row = {'uid': asset['uid'], 'target': asset['target'], 'previewBudget': asset['previewBudget']}
        for field in ('sourceCredits', 'sourceNotes'):
            if field in asset:
                row[field] = asset[field]
        report[asset_id] = row
        try:
            base = args.source_dir.resolve() / asset_id
            candidates = [base.with_suffix(ext) for ext in ('.glb', '.gltf') if base.with_suffix(ext).is_file()]
            if len(candidates) != 1:
                raise ValueError(f'expected one {asset_id}.glb or {asset_id}.gltf export')
            row['file'] = candidates[0].name
            row.update(inspect(candidates[0], asset['previewBudget']))
        except (OSError, RuntimeError, ValueError) as error:
            row['error'] = str(error)
            failed = True
    args.report.write_text(json.dumps(report, indent=2) + '\n')
    if failed:
        raise RuntimeError(f'One or more models could not be inspected. See {args.report}.')


if __name__ == '__main__':
    main()
