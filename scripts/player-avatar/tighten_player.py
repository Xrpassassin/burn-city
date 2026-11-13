# Second-pass: reorient to face Blender -Y (glTF -Z), hit triangle budgets, harden torso weights.
# blender -b --factory-startup -P tighten_player.py -- <in_gltf> <out_dir> [qa_dir]
import bpy, sys, json, math, os, bmesh
from pathlib import Path
from mathutils import Matrix, Vector

a = sys.argv[sys.argv.index('--') + 1:]
SRC, OUT = a[0], a[1]
QA = a[2] if len(a) > 2 else None
MID = 'gas-mask-guy'
NEAR_TRIS, FAR_TRIS = 9000, 2500
os.makedirs(OUT, exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SRC)
meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
armatures = [o for o in bpy.context.scene.objects if o.type == 'ARMATURE']
assert len(meshes) >= 1 and len(armatures) == 1, (len(meshes), len(armatures))
# Keep the near-sized mesh (largest)
ob = max(meshes, key=lambda o: len(o.data.polygons))
arm_ob = armatures[0]
for o in meshes:
    if o != ob: bpy.data.objects.remove(o, do_unlink=True)
ob.name = MID
H = 1.8

def tris(o): return sum(len(p.vertices) - 2 for p in o.data.polygons)
print('IMPORT_TRIS', tris(ob), 'anims', [a.name for a in bpy.data.actions], flush=True)

# Rotate 180 around Z so the mask faces Blender -Y / glTF -Z
for o in (arm_ob, ob):
    o.rotation_mode = 'XYZ'
    o.rotation_euler[2] = math.pi
    bpy.context.view_layer.objects.active = o
    o.select_set(True)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)
    o.select_set(False)

def decimate(o, target):
    bpy.ops.object.mode_set(mode='OBJECT')
    for o2 in bpy.context.scene.objects: o2.select_set(False)
    o.select_set(True)
    bpy.context.view_layer.objects.active = o
    guard = 0
    while tris(o) > target * 1.04 and guard < 8:
        current = tris(o)
        ratio = max(0.05, min(0.85, target / max(1, current)))
        m = o.modifiers.new('dec', 'DECIMATE')
        m.ratio = ratio
        m.use_collapse_triangulate = True
        # Apply the decimate on the base mesh, in front of the armature deform
        while o.modifiers[0].name != m.name:
            bpy.ops.object.modifier_move_up(modifier=m.name)
        try:
            bpy.ops.object.modifier_apply(modifier=m.name)
        except Exception as e:
            print('APPLY_FAIL', e, flush=True)
            o.modifiers.remove(m)
            break
        new = tris(o)
        print('DECIMATE', current, '->', new, 'ratio', round(ratio, 3), flush=True)
        if new >= current * 0.98:
            print('DECIMATE_STALLED', flush=True)
            break
        guard += 1

decimate(ob, NEAR_TRIS)
print('NEAR_TRIS', tris(ob), flush=True)

# Torso should not be pulled by legs (fixes coat/backpack spikes when sitting)
H = max((ob.matrix_world @ v.co).z for v in ob.data.vertices)
print('HEIGHT', H, flush=True)
leg = [n for n in (g.name for g in ob.vertex_groups) if n.split('.')[0] in ('thigh', 'shin', 'foot')]
arm = [n for n in (g.name for g in ob.vertex_groups) if n.split('.')[0] in ('upperarm', 'forearm', 'hand')]
cleaned = 0
for v in ob.data.vertices:
    p = ob.matrix_world @ v.co
    if p.z > .52 * H:
        for g in list(v.groups):
            name = ob.vertex_groups[g.group].name
            if name in leg:
                ob.vertex_groups[g.group].remove([v.index]); cleaned += 1
print('TORSO_LEG_WEIGHTS_CLEARED', cleaned, flush=True)

def duplicate(name):
    d = ob.copy(); d.data = ob.data.copy(); bpy.context.scene.collection.objects.link(d); d.name = name
    if not any(m.type == 'ARMATURE' for m in d.modifiers):
        m = d.modifiers.new('Armature', 'ARMATURE'); m.object = arm_ob
    return d

far = duplicate(MID + '-lod')
decimate(far, FAR_TRIS)
print('FAR_TRIS', tris(far), flush=True)

body = duplicate(MID + '-body')
head_groups = {body.vertex_groups[n].index for n in ('head', 'neck') if body.vertex_groups.get(n)}
bm = bmesh.new(); bm.from_mesh(body.data); bm.verts.ensure_lookup_table()
kill = []
for v in bm.verts:
    src = body.data.vertices[v.index]
    p = body.matrix_world @ src.co
    whead = sum(g.weight for g in src.groups if g.group in head_groups)
    if p.z > .82 * H or whead > .45:
        kill.append(v)
bmesh.ops.delete(bm, geom=kill, context='VERTS')
bm.to_mesh(body.data); bm.free(); body.data.update()
print('BODY_TRIS', tris(body), 'removed', len(kill), flush=True)

def export_pair(mesh, path):
    for o in bpy.context.scene.objects: o.select_set(False)
    mesh.select_set(True); arm_ob.select_set(True)
    bpy.context.view_layer.objects.active = mesh
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLTF_SEPARATE', export_texture_dir=MID + '-tex', use_selection=True,
        export_image_format='WEBP', export_image_quality=80, export_animation_mode='NLA_TRACKS', export_force_sampling=True,
        export_def_bones=False, export_optimize_animation_size=True, export_texcoords=True, export_normals=True,
        export_tangents=False, export_yup=True, export_skins=True, export_morph=False, export_lights=False, export_cameras=False)

# Clear previous exports so we don't mix old bins
for p in Path(OUT).glob('gas-mask-guy*.gltf'): p.unlink(missing_ok=True)
for p in Path(OUT).glob('gas-mask-guy*.bin'): p.unlink(missing_ok=True)

export_pair(ob, os.path.join(OUT, MID + '.gltf'))
export_pair(far, os.path.join(OUT, MID + '-lod.gltf'))
export_pair(body, os.path.join(OUT, MID + '-body.gltf'))

meta = {'id': MID, 'height': H, 'nearTris': tris(ob), 'farTris': tris(far), 'bodyTris': tris(body),
        'torsoLegWeightsCleared': cleaned, 'clips': sorted({a.name.split('.')[0] for a in bpy.data.actions})}
Path(OUT, 'build-meta.json').write_text(json.dumps(meta, indent=2))
print('TIGHTEN_DONE', json.dumps(meta), flush=True)

if QA:
    os.makedirs(QA, exist_ok=True)
    scn = bpy.context.scene
    scn.render.engine = 'BLENDER_WORKBENCH'; scn.display.shading.color_type = 'TEXTURE'; scn.display.shading.light = 'STUDIO'
    scn.render.resolution_x, scn.render.resolution_y = 480, 640
    bpy.ops.object.camera_add(); cam = bpy.context.object; scn.camera = cam; cam.data.type = 'ORTHO'; cam.data.ortho_scale = H * 1.2
    w = bpy.data.worlds.new('w'); scn.world = w
    far.hide_render = True; body.hide_render = True; far.hide_viewport = True; body.hide_viewport = True
    # Prefer NLA or actions
    acts = {a.name: a for a in bpy.data.actions}
    def act(*names):
        for n in names:
            if n in acts: return acts[n]
            for k,v in acts.items():
                if k.startswith(n): return v
        return None
    arm_ob.animation_data_create()
    arm_ob.animation_data.use_nla = False
    shots = [
        ('front_rest', None, 0, (0, -6, H / 2), (90, 0, 0)),
        ('side_rest', None, 0, (6, 0, H / 2), (90, 0, 90)),
        ('front_walk6', act('Walk'), 6, (0, -6, H / 2), (90, 0, 0)),
        ('side_walk0', act('Walk'), 0, (6, 0, H / 2), (90, 0, 90)),
        ('side_walk6', act('Walk'), 6, (6, 0, H / 2), (90, 0, 90)),
        ('front_run6', act('Run'), 6, (0, -6, H / 2), (90, 0, 0)),
        ('side_ride', act('Ride'), 0, (6, 0, H / 2), (90, 0, 90)),
        ('front_body', None, 0, (0, -6, H / 2), (90, 0, 0)),
    ]
    for tag, ac, fr, loc, rot in shots:
        if tag == 'front_body':
            body.hide_render = False; ob.hide_render = True
        else:
            body.hide_render = True; ob.hide_render = False
        arm_ob.animation_data.action = ac; scn.frame_set(fr)
        if ac is None:
            bpy.context.view_layer.objects.active = arm_ob
            bpy.ops.object.mode_set(mode='POSE')
            for pb in arm_ob.pose.bones: pb.matrix_basis = Matrix.Identity(4)
            bpy.ops.object.mode_set(mode='OBJECT')
        cam.location = loc; cam.rotation_euler = tuple(math.radians(r) for r in rot)
        scn.render.filepath = os.path.join(QA, f'{MID}_{tag}.png'); bpy.ops.render.render(write_still=True)
