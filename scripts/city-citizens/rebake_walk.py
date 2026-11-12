"""Refresh both walk LODs from the committed rigs. No source downloads required.

blender -b --python-exit-code 1 -P scripts/city-citizens/rebake_walk.py -- client/assets/citizens [model-id ...]
"""
import json
from pathlib import Path
import struct
import sys

import bpy
from mathutils import Matrix, Quaternion, Vector

sys.path.insert(0, str(Path(__file__).parent))
from citizen_gait import WALK_FRAMES, make_walk, stride_for
from citizen_vat import sample_mesh, write_vat

Y_UP = Matrix(((1, 0, 0, 0), (0, 0, 1, 0), (0, -1, 0, 0), (0, 0, 0, 1)))


def write_walk(path, gltf, rig, scene):
    # Use the original node hierarchy and mesh buffer. Convert Blender's
    # deformation matrices back into that skeleton's local glTF transforms.
    walk = next(a for a in gltf['animations'] if a['name'] == 'Walk')
    if walk.get('extras', {}).get('citizenWalkBase'):
        # Re-running replaces our own appended data instead of accumulating it.
        buffers, views, accessors = walk['extras']['citizenWalkBase']
        del gltf['buffers'][buffers:]
        del gltf['bufferViews'][views:]
        del gltf['accessors'][accessors:]
    base = [len(gltf[key]) for key in ('buffers', 'bufferViews', 'accessors')]
    nodes = gltf['nodes']
    joints = gltf['skins'][0]['joints']
    parents = {child: parent for parent, node in enumerate(nodes) for child in node.get('children', [])}
    bind = {}
    for joint in joints:
        node = nodes[joint]
        x, y, z, w = node.get('rotation', (0, 0, 0, 1))
        local = Matrix.LocRotScale(Vector(node.get('translation', (0, 0, 0))),
                                    Quaternion((w, x, y, z)), Vector(node.get('scale', (1, 1, 1))))
        bind[joint] = bind.get(parents[joint], Matrix.Identity(4)) @ local

    rotation = {j: [] for j in joints}
    root = joints[0]
    translation = []
    for frame in range(WALK_FRAMES + 1):
        scene.frame_set(frame)
        posed = {}
        for j in joints:
            bone = rig.pose.bones[nodes[j]['name']]
            delta = Y_UP @ bone.matrix @ bone.bone.matrix_local.inverted() @ Y_UP.inverted()
            posed[j] = delta @ bind[j]
            local = posed.get(parents[j], Matrix.Identity(4)).inverted() @ posed[j]
            q = local.to_quaternion()
            if rotation[j]:
                q.make_compatible(rotation[j][-1])
            rotation[j].append(q)
            if j == root:
                translation.append(local.translation.copy())

    data = bytearray()

    def accessor(values, kind, count, **limits):
        offset = len(data)
        data.extend(struct.pack(f'<{len(values)}f', *values))
        view = len(gltf['bufferViews'])
        gltf['bufferViews'].append(dict(buffer=base[0], byteOffset=offset, byteLength=len(data) - offset))
        gltf['accessors'].append(dict(bufferView=view, componentType=5126, count=count, type=kind, **limits))
        return len(gltf['accessors']) - 1

    count = WALK_FRAMES + 1
    time = accessor([f / WALK_FRAMES for f in range(count)], 'SCALAR', count, min=[0], max=[1])
    channels, samplers = [], []

    def channel(joint, prop, values, kind):
        channels.append(dict(sampler=len(samplers), target=dict(node=joint, path=prop)))
        samplers.append(dict(input=time, output=accessor(values, kind, count)))

    for j in joints:
        channel(j, 'rotation', [v for q in rotation[j] for v in (q.x, q.y, q.z, q.w)], 'VEC4')
    channel(root, 'translation', [v for t in translation for v in t], 'VEC3')
    walk.update(channels=channels, samplers=samplers, extras={'citizenWalkBase': base})
    buffer = path.with_suffix('.walk.bin')
    gltf['buffers'].append(dict(byteLength=len(data), uri=buffer.name))
    buffer.write_bytes(data)
    path.write_text(json.dumps(gltf, indent='\t', separators=(',', ':'), ensure_ascii=False) + '\n')


def rebake(assets, model):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    path = assets / f'{model}.gltf'
    gltf = json.loads(path.read_text())
    # Idle stays authored as shipped. Omit the previous walk during the import.
    gltf['animations'], animations = [a for a in gltf['animations'] if a['name'] == 'Idle'], gltf['animations']
    import_path = assets / f'.{model}-idle.gltf'
    try:
        import_path.write_text(json.dumps(gltf))
        bpy.ops.import_scene.gltf(filepath=str(import_path))
    finally:
        import_path.unlink(missing_ok=True)
    gltf['animations'] = animations

    scene = bpy.context.scene
    scene.render.fps = 24
    rig = next(o for o in scene.objects if o.type == 'ARMATURE')
    mesh = next(o for o in scene.objects if o.type == 'MESH')
    bpy.context.view_layer.objects.active = mesh
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.remove_doubles(threshold=.000001)
    bpy.ops.object.mode_set(mode='OBJECT')
    decimate = mesh.modifiers.new('Far LOD', 'DECIMATE')
    decimate.ratio = min(1, 1200 / sum(len(p.vertices) - 2 for p in mesh.data.polygons))
    decimate.use_collapse_triangulate = True
    bpy.ops.object.modifier_move_up(modifier=decimate.name)
    bpy.ops.object.modifier_apply(modifier=decimate.name)

    scene.frame_set(0)
    depsgraph = bpy.context.evaluated_depsgraph_get()
    idle = sample_mesh(mesh, depsgraph)
    rig.animation_data_clear()
    meta_path = assets / f'{model}.far.json'
    meta = json.loads(meta_path.read_text())
    rig.animation_data_create()
    rig.animation_data.action = make_walk(rig, meta['height'], model)
    frames = []
    for i in range(meta['walkFrames']):
        frame = i * WALK_FRAMES / meta['walkFrames']
        scene.frame_set(int(frame), subframe=frame % 1)
        frames.append(sample_mesh(mesh, depsgraph))
    meta['strideMetersPerCycle'] = stride_for(meta['height'], model)
    write_vat(meta_path, mesh.data, frames + [idle], meta)
    write_walk(path, gltf, rig, scene)
    print('Rebaked', model, flush=True)


args = sys.argv[sys.argv.index('--') + 1:]
assets = Path(args[0]).resolve()
for model in args[1:] or [m['id'] for m in json.loads((assets / 'models.json').read_text())['models']]:
    rebake(assets, model)
