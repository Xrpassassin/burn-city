# Blender 4.2 (headless):  blender -b --factory-startup -P prep_source.py -- <src scene.gltf> <out.glb> [split_frac]
# With split_frac (e.g. 0.84) it also writes <out>-head.glb / <out>-body.glb, split at that fraction of the height, so the
# head can be simplified with a bigger triangle budget (gltfpack -slb keeps the shared border watertight).
# Joins a Sketchfab scan/model into one static mesh (weld the 65k-vertex export chunks, keep UV0 only, no materials)
# so meshoptimizer (gltfpack) can simplify it with its UV seams and borders intact. See README.md.
import bpy, sys
a = sys.argv[sys.argv.index('--') + 1:]
SRC, OUT = a[0], a[1]
SPLIT = float(a[2]) if len(a) > 2 else None
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SRC)
meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
for o in bpy.context.scene.objects: o.select_set(False)
for o in meshes: o.select_set(True)
bpy.context.view_layer.objects.active = meshes[0]
if len(meshes) > 1: bpy.ops.object.join()
ob = bpy.context.view_layer.objects.active
bpy.ops.object.parent_clear(type='CLEAR_KEEP_TRANSFORM')
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
for o in list(bpy.context.scene.objects):
    if o != ob: bpy.data.objects.remove(o)
uv = ob.data.uv_layers
while len(uv) > 1: uv.remove(uv[len(uv) - 1])
zs = [v.co.z for v in ob.data.vertices]; H = max(zs) - min(zs)
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.mesh.remove_doubles(threshold=.0002 * H)   # weld chunk seams only (UVs stay per-corner, so texture seams survive)
bpy.ops.mesh.delete_loose(use_verts=True, use_edges=True, use_faces=False)
bpy.ops.object.mode_set(mode='OBJECT')
ob.data.materials.clear()
print('PREP_TRIS', sum(len(p.vertices) - 2 for p in ob.data.polygons), 'H', H, flush=True)
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', use_selection=False, export_materials='NONE', export_texcoords=True,
    export_normals=True, export_tangents=False, export_yup=True, export_animations=False, export_skins=False, export_morph=False)

if SPLIT:
    import bmesh
    z0 = min(zs); cut = z0 + SPLIT * H
    for part, keep_head in (('head', True), ('body', False)):
        c = ob.copy(); c.data = ob.data.copy(); bpy.context.scene.collection.objects.link(c)
        bm = bmesh.new(); bm.from_mesh(c.data)
        kill = [f for f in bm.faces if (f.calc_center_median().z >= cut) != keep_head]
        bmesh.ops.delete(bm, geom=kill, context='FACES'); bm.to_mesh(c.data); bm.free()
        for o in bpy.context.scene.objects: o.select_set(o == c)
        bpy.ops.export_scene.gltf(filepath=OUT.replace('.glb', '-' + part + '.glb'), export_format='GLB', use_selection=True, export_materials='NONE',
            export_texcoords=True, export_normals=True, export_tangents=False, export_yup=True, export_animations=False, export_skins=False, export_morph=False)
        print('PREP_PART', part, sum(len(p.vertices) - 2 for p in c.data.polygons), flush=True)
        bpy.data.objects.remove(c)
