# Blender 4.2 (headless):
#   blender -b --factory-startup -P build_player.py -- <src_dir> <out_dir> [qa_dir]
# Turns the CC BY Gas Mask Guy scan (unrigged, ~2M tris) into game-ready player exports:
#   gas-mask-guy.gltf        third-person near LOD (~8-10k tris), 1.8 m, Y-up, feet at origin, facing -Z
#   gas-mask-guy-lod.gltf    distant third-person (~2-3k tris), same rig and clips
#   gas-mask-guy-body.gltf   first-person body (head stripped), same clips plus Sit/Jump
# Clips: Idle, Walk, Run, Ride, Sit, Jump (procedural, in-house). Textures: 1024 and 512 webp.
import bpy, sys, json, math, os, shutil
from pathlib import Path
from mathutils import Matrix, Vector
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / 'city-citizens'))
from citizen_gait import WALK_FRAMES, make_walk, stride_for

a = sys.argv[sys.argv.index('--') + 1:]
SRC, OUT = a[0], a[1]
QA = a[2] if len(a) > 2 else None
MID = 'gas-mask-guy'
HEIGHT = 1.8
NEAR_TRIS, FAR_TRIS = 9000, 2500
os.makedirs(OUT, exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=os.path.join(SRC, 'scene.gltf'))
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
ob.name = MID

vs = [v.co.copy() for v in ob.data.vertices]
zmin = min(v.z for v in vs); zmax = max(v.z for v in vs); s = HEIGHT / (zmax - zmin)
mid = [v for v in vs if zmin + .45 * (zmax - zmin) < v.z < zmin + .6 * (zmax - zmin)]
cx = sum(v.x for v in mid) / len(mid); cy = sum(v.y for v in mid) / len(mid)
for v in ob.data.vertices: v.co = Vector(((v.co.x - cx) * s, (v.co.y - cy) * s, (v.co.z - zmin) * s))
H = HEIGHT

def tris(o): return sum(len(p.vertices) - 2 for p in o.data.polygons)
def decimate(o, target):
    current = tris(o)
    if current <= target: return
    m = o.modifiers.new('dec', 'DECIMATE'); m.ratio = min(1, target / max(1, current)); m.use_collapse_triangulate = True
    bpy.context.view_layer.objects.active = o; bpy.ops.object.modifier_apply(modifier='dec')

src_tris = tris(ob)
print('SRC_TRIS', src_tris, 'bbox_z', 0, H, 'verts', len(ob.data.vertices), flush=True)
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.mesh.remove_doubles(threshold=.0005 * H); bpy.ops.mesh.delete_loose(); bpy.ops.object.mode_set(mode='OBJECT')
# Two-stage collapse is much faster on a 2M-triangle scan and still keeps UVs.
if tris(ob) > 80000:
    decimate(ob, 80000)
    print('MID_TRIS', tris(ob), flush=True)
decimate(ob, NEAR_TRIS)
bpy.ops.object.shade_smooth()
print('NEAR_TRIS', tris(ob), flush=True)

# Materials: keep base colour at 1024, drop the scan normal (often muddy after heavy collapse).
mat = ob.data.materials[0]; nt = mat.node_tree
bsdf = next((n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'), None)
if bsdf is None:
    img = next(n.image for n in nt.nodes if n.type == 'TEX_IMAGE' and n.image)
    mat = bpy.data.materials.new(MID + '_mat'); mat.use_nodes = True; nt = mat.node_tree
    bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'); tn = nt.nodes.new('ShaderNodeTexImage'); tn.image = img
    nt.links.new(tn.outputs['Color'], bsdf.inputs['Base Color']); ob.data.materials[0] = mat
base_img = None
for inp in ['Emission Color', 'Metallic', 'Roughness']:
    for l in list(bsdf.inputs[inp].links): nt.links.remove(l)
bsdf.inputs['Metallic'].default_value = 0; bsdf.inputs['Roughness'].default_value = .8
bsdf.inputs['Emission Strength'].default_value = 0
for n in list(nt.nodes):
    if n.type == 'TEX_IMAGE' and n.image:
        nm = n.image.name.lower()
        if 'basecolor' in nm or 'base_color' in nm or 'albedo' in nm or n.image.filepath.lower().endswith(('.jpeg', '.jpg')):
            base_img = n.image
            if n.image.size[0] > 1024 or n.image.size[1] > 1024:
                n.image.scale(1024, 1024)
            nt.nodes.active = n
        elif 'normal' in nm:
            nt.nodes.remove(n)
for n in list(nt.nodes):
    if n.type == 'TEX_IMAGE' and n.image and not n.outputs['Color'].links: nt.nodes.remove(n)

# Joint estimation (same approach as city citizens)
P = [ob.matrix_world @ v.co for v in ob.data.vertices]
def cen(z0, z1, f=lambda p: True):
    q = [p for p in P if z0 * H <= p.z < z1 * H and f(p)]
    if not q: return None
    return Vector((sum(p.x for p in q) / len(q), sum(p.y for p in q) / len(q), (z0 + z1) / 2 * H))
J = {}
core = lambda p: abs(p.x) < .07 * H
def need(name, *args, **kwargs):
    v = cen(*args, **kwargs)
    if v is None: raise SystemExit(f'missing joint {name}')
    return v
J['pelvis'] = need('pelvis', .50, .54, core); J['spine'] = need('spine', .62, .64, core); J['chest'] = need('chest', .72, .74, core)
J['neck'] = need('neck', .84, .86, core); J['head'] = need('head', .88, .90, core); J['top'] = Vector((J['head'].x, J['head'].y, H))
def two(z0, z1, prevL, prevR):
    q = [p for p in P if z0 * H <= p.z < z1 * H and abs(p.x) < .16 * H]
    cL, cR = prevL.xy.copy(), prevR.xy.copy()
    for _ in range(12):
        A = [p for p in q if (p.xy - cL).length <= (p.xy - cR).length]; B = [p for p in q if (p.xy - cL).length > (p.xy - cR).length]
        if not A or not B: break
        cL = Vector((sum(p.x for p in A) / len(A), sum(p.y for p in A) / len(A))); cR = Vector((sum(p.x for p in B) / len(B), sum(p.y for p in B) / len(B)))
    z = (z0 + z1) / 2 * H
    return Vector((cL.x, cL.y, z)), Vector((cR.x, cR.y, z))
J['hipL'] = need('hipL', .46, .49, lambda p: .005 * H < p.x < .14 * H)
J['hipR'] = need('hipR', .46, .49, lambda p: -.14 * H < p.x < -.005 * H)
J['kneeL'], J['kneeR'] = two(.27, .30, J['hipL'], J['hipR'])
J['ankleL'], J['ankleR'] = two(.045, .07, J['kneeL'], J['kneeR'])
for side, sg in (('L', 1), ('R', -1)):
    J['toe' + side] = J['ankle' + side] + Vector((0, -.075 * H, -.04 * H))
ARMS_OUT = {}
for side, sg in (('L', 1), ('R', -1)):
    def arm(z0, z1, sg=sg):
        q = [p for p in P if z0 * H <= p.z < z1 * H and sg * p.x > 0]
        ext = max(sg * p.x for p in q)
        return cen(z0, z1, lambda p, sg=sg, ext=ext: sg * p.x > ext - .045 * H)
    band = [p for p in P if .48 * H < p.z < .86 * H and sg * p.x > 0]
    reach = max(sg * p.x for p in band); print('REACH', side, round(reach / H, 3), flush=True)
    if reach > .30 * H:
        ARMS_OUT[side] = True
        def armx(f, sg=sg, reach=reach):
            x0 = .12 * H + f * (reach - .12 * H); q = [p for p in P if abs(sg * p.x - x0) < .02 * H and p.z > .55 * H]
            return Vector((sum(p.x for p in q) / len(q), sum(p.y for p in q) / len(q), sum(p.z for p in q) / len(q)))
        J['shoulder' + side] = Vector((sg * .105 * H, J['chest'].y, .815 * H)); J['elbow' + side] = armx(.42); J['wrist' + side] = armx(.82)
        J['hand' + side] = J['wrist' + side] + (J['wrist' + side] - J['elbow' + side]).normalized() * .07 * H
        continue
    sh = arm(.80, .82); sh.x -= sg * .035 * H
    J['shoulder' + side] = sh; J['elbow' + side] = arm(.61, .63); J['wrist' + side] = arm(.47, .49)
    if sg * J['elbow' + side].x < .09 * H: J['elbow' + side].x = sh.x
    J['hand' + side] = J['wrist' + side] + Vector((0, 0, -.07 * H))

# Armature
bpy.ops.object.armature_add(location=(0, 0, 0)); arm_ob = bpy.context.object; arm_ob.name = MID + '_rig'
bpy.ops.object.mode_set(mode='EDIT'); eb = arm_ob.data.edit_bones; eb.remove(eb[0])
def bone(n, h, t, parent=None):
    b = eb.new(n); b.head = J[h]; b.tail = J[t]
    if parent: b.parent = eb[parent]
    b.align_roll(Vector((1, 0, 0)).cross((b.tail - b.head).normalized()))
    return b
bone('hips', 'pelvis', 'spine'); bone('spine', 'spine', 'chest', 'hips'); bone('chest', 'chest', 'neck', 'spine')
bone('neck', 'neck', 'head', 'chest'); bone('head', 'head', 'top', 'neck')
for s in 'LR':
    bone('thigh.' + s, 'hip' + s, 'knee' + s, 'hips'); bone('shin.' + s, 'knee' + s, 'ankle' + s, 'thigh.' + s); bone('foot.' + s, 'ankle' + s, 'toe' + s, 'shin.' + s)
    bone('upperarm.' + s, 'shoulder' + s, 'elbow' + s, 'chest'); bone('forearm.' + s, 'elbow' + s, 'wrist' + s, 'upperarm.' + s); bone('hand.' + s, 'wrist' + s, 'hand' + s, 'forearm.' + s)
bpy.ops.object.mode_set(mode='OBJECT')

# Automatic weights + the same limb cleanup as city citizens
for o in bpy.context.scene.objects: o.select_set(False)
ob.select_set(True); arm_ob.select_set(True); bpy.context.view_layer.objects.active = arm_ob
bpy.ops.object.parent_set(type='ARMATURE_AUTO')
names = [b.name for b in arm_ob.data.bones]
def segd(p, b):
    h, t = arm_ob.matrix_world @ b.head_local, arm_ob.matrix_world @ b.tail_local
    d = t - h; u = max(0, min(1, (p - h).dot(d) / d.length_squared)); return (h + d * u - p).length
unweighted = 0
for v in ob.data.vertices:
    if sum(g.weight for g in v.groups if ob.vertex_groups[g.group].name in names) < 1e-3:
        unweighted += 1
        b = min(arm_ob.data.bones, key=lambda b: segd(ob.matrix_world @ v.co, b))
        g = ob.vertex_groups.get(b.name) or ob.vertex_groups.new(name=b.name); g.add([v.index], 1.0, 'REPLACE')

limb = [n for n in names if n.split('.')[0] in ('upperarm', 'forearm', 'hand', 'thigh', 'shin', 'foot')]
R = {'upperarm': .075, 'forearm': .06, 'hand': .06, 'thigh': .11, 'shin': .08, 'foot': .07}
cleaned = 0
for v in ob.data.vertices:
    p = ob.matrix_world @ v.co
    for g in list(v.groups):
        n = ob.vertex_groups[g.group].name
        if n in limb and g.weight > 0 and segd(p, arm_ob.data.bones[n]) > R[n.split('.')[0]] * H:
            ob.vertex_groups[g.group].remove([v.index]); cleaned += 1
    if sum(g.weight for g in v.groups if ob.vertex_groups[g.group].name in names) < 1e-3:
        b = min(arm_ob.data.bones, key=lambda b: segd(p, b))
        (ob.vertex_groups.get(b.name) or ob.vertex_groups.new(name=b.name)).add([v.index], 1.0, 'REPLACE')

legs = {s: ['thigh.' + s, 'shin.' + s, 'foot.' + s] for s in 'LR'}
side_fixed = 0
for v in ob.data.vertices:
    p = ob.matrix_world @ v.co
    if p.z > .5 * H: continue
    dL = min(segd(p, arm_ob.data.bones[n]) for n in legs['L']); dR = min(segd(p, arm_ob.data.bones[n]) for n in legs['R'])
    if abs(dL - dR) < .012 * H: continue
    far_side = 'R' if dL < dR else 'L'
    for g in list(v.groups):
        if ob.vertex_groups[g.group].name in legs[far_side]: ob.vertex_groups[g.group].remove([v.index]); side_fixed += 1
    if sum(g.weight for g in v.groups if ob.vertex_groups[g.group].name in names) < 1e-3:
        n = min(legs['L' if far_side == 'R' else 'R'], key=lambda n: segd(p, arm_ob.data.bones[n])); ob.vertex_groups[n].add([v.index], 1.0, 'REPLACE')

import bmesh
gidx = {ob.vertex_groups[n].index: s for s in 'LR' for n in legs[s] if ob.vertex_groups.get(n)}
def vside(v):
    w = {'L': 0, 'R': 0}
    for g in v.groups:
        if g.group in gidx: w[gidx[g.group]] += g.weight
    return None if w['L'] + w['R'] < .5 else ('L' if w['L'] > w['R'] else 'R')
sides = [vside(v) if (ob.matrix_world @ v.co).z < .32 * H else None for v in ob.data.vertices]
bm = bmesh.new(); bm.from_mesh(ob.data); bm.faces.ensure_lookup_table()
web = [f for f in bm.faces if len({sides[v.index] for v in f.verts if sides[v.index]}) > 1]
bmesh.ops.delete(bm, geom=web, context='FACES_ONLY'); bm.to_mesh(ob.data); bm.free(); ob.data.update()
webs_cut = len(web)

if ARMS_OUT:
    bpy.context.view_layer.objects.active = arm_ob; bpy.ops.object.mode_set(mode='POSE')
    for side, sg in (('L', 1), ('R', -1)):
        if not ARMS_OUT.get(side): continue
        pb = arm_ob.pose.bones['upperarm.' + side]; hd = J['shoulder' + side]
        cur = (J['wrist' + side] - hd).normalized(); tgt = Vector((sg * math.sin(math.radians(9)), cur.y * .3, -math.cos(math.radians(9)))).normalized()
        pb.matrix = Matrix.Translation(hd) @ cur.rotation_difference(tgt).to_matrix().to_4x4() @ Matrix.Translation(-hd) @ pb.matrix
    bpy.context.view_layer.update(); bpy.ops.object.mode_set(mode='OBJECT')
    bpy.context.view_layer.objects.active = ob
    mod = next(m for m in ob.modifiers if m.type == 'ARMATURE'); bpy.ops.object.modifier_apply(modifier=mod.name)
    bpy.context.view_layer.objects.active = arm_ob; bpy.ops.object.mode_set(mode='POSE'); bpy.ops.pose.select_all(action='SELECT'); bpy.ops.pose.armature_apply(selected=False)
    bpy.ops.object.mode_set(mode='EDIT')
    for b in arm_ob.data.edit_bones: b.align_roll(Vector((1, 0, 0)).cross((b.tail - b.head).normalized()))
    bpy.ops.object.mode_set(mode='OBJECT')
    m = ob.modifiers.new('Armature', 'ARMATURE'); m.object = arm_ob

# ---- clips
D = math.radians
def keyclip(name, frames, fn):
    act = bpy.data.actions.new(name); act.use_fake_user = True; arm_ob.animation_data_create(); arm_ob.animation_data.action = act
    for pb in arm_ob.pose.bones: pb.rotation_mode = 'XYZ'
    previous = {}
    for f in range(frames + 1):
        for pb in arm_ob.pose.bones: pb.rotation_euler = (0, 0, 0); pb.location = (0, 0, 0)
        fn(f / max(1, frames) * 2 * math.pi, f / max(1, frames))
        for pb in arm_ob.pose.bones:
            q = pb.rotation_euler.to_quaternion()
            if pb.name in previous: q.make_compatible(previous[pb.name])
            previous[pb.name] = q.copy()
            pb.rotation_quaternion = q
            pb.rotation_mode = 'QUATERNION'
            pb.keyframe_insert('rotation_quaternion', frame=f); pb.keyframe_insert('location', frame=f)
            pb.rotation_mode = 'XYZ'
    for pb in arm_ob.pose.bones: pb.rotation_mode = 'QUATERNION'
    for fc in act.fcurves:
        for k in fc.keyframe_points: k.interpolation = 'LINEAR' if name in ('Walk', 'Run') else 'BEZIER'
    return act

PB = arm_ob.pose.bones
def idle(p, u):
    PB['spine'].rotation_euler.x = D(1.2) * math.sin(p); PB['chest'].rotation_euler.x = D(1) * math.sin(p + .6)
    PB['hips'].location.z = .004 * math.sin(p); PB['head'].rotation_euler.y = D(6) * math.sin(p * .5)
    for s, sg in (('L', 1), ('R', -1)):
        PB['upperarm.' + s].rotation_euler.x = D(1.5) * math.sin(p + sg); PB['forearm.' + s].rotation_euler.x = -D(6)

scn = bpy.context.scene; scn.render.fps = 24
A_idle = keyclip('Idle', 48, idle)
A_walk = make_walk(arm_ob, H, MID)

def make_run(rig, height):
    # A longer, quicker stride than Walk, with a forward lean and higher feet.
    # Temporarily scale the walk author's stride by using a taller virtual height, then add lean.
    act = make_walk(rig, height * 1.18, MID + '-run')
    act.name = 'Run'
    # Overlay a constant forward lean on hips/spine/chest by mixing extra keys would fight IK feet.
    # Instead leave the run as a longer walk; loader uses it when moving fast.
    return act
A_run = make_run(arm_ob, H)

def seated(p, u, arms_forward=True, bounce=True):
    # Sit / Ride: hips drop, thighs forward, shins down, hands toward a bar.
    drop = .18 * H
    PB['hips'].location.z = -drop + (.008 * math.sin(p) if bounce else 0)
    PB['hips'].rotation_euler.x = D(12)
    PB['spine'].rotation_euler.x = -D(8)
    PB['chest'].rotation_euler.x = -D(4)
    PB['head'].rotation_euler.x = D(4)
    for s, sg in (('L', 1), ('R', -1)):
        PB['thigh.' + s].rotation_euler.x = -D(78)
        PB['shin.' + s].rotation_euler.x = D(82)
        PB['foot.' + s].rotation_euler.x = -D(8)
        if arms_forward:
            PB['upperarm.' + s].rotation_euler.x = -D(55)
            PB['upperarm.' + s].rotation_euler.z = -sg * D(8)
            PB['forearm.' + s].rotation_euler.x = -D(25)
        else:
            PB['upperarm.' + s].rotation_euler.x = D(8)
            PB['forearm.' + s].rotation_euler.x = -D(70)
A_ride = keyclip('Ride', 36, lambda p, u: seated(p, u, True, True))
A_sit = keyclip('Sit', 24, lambda p, u: seated(p, u, False, False))

def jump(p, u):
    # Anticipation, stretch, hang, land — one short clip the tower body can play.
    if u < .18:
        k = u / .18; squat = k
    elif u < .45:
        k = (u - .18) / .27; squat = 1 - k
    elif u < .7:
        squat = 0
    else:
        k = (u - .7) / .3; squat = math.sin(math.pi * k) * .35
    PB['hips'].location.z = (.22 * H if .18 <= u < .7 else -0.04 * H * squat)
    PB['hips'].rotation_euler.x = D(8) * squat
    for s in 'LR':
        PB['thigh.' + s].rotation_euler.x = -D(55) * squat
        PB['shin.' + s].rotation_euler.x = D(70) * squat
        PB['upperarm.' + s].rotation_euler.x = -D(40) + D(50) * (1 if .18 <= u < .7 else 0)
        PB['forearm.' + s].rotation_euler.x = -D(20)
A_jump = keyclip('Jump', 20, jump)

for act in (A_idle, A_walk, A_run, A_ride, A_sit, A_jump):
    tr = arm_ob.animation_data.nla_tracks.new(); tr.name = act.name; tr.strips.new(act.name, 0, act)
arm_ob.animation_data.action = None

def export_pair(mesh, path):
    for o in bpy.context.scene.objects: o.select_set(False)
    mesh.select_set(True); arm_ob.select_set(True)
    bpy.context.view_layer.objects.active = mesh
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLTF_SEPARATE', export_texture_dir=MID + '-tex', use_selection=True,
        export_image_format='WEBP', export_image_quality=80, export_animation_mode='NLA_TRACKS', export_force_sampling=True,
        export_def_bones=False, export_optimize_animation_size=True, export_texcoords=True, export_normals=True,
        export_tangents=False, export_yup=True, export_skins=True, export_morph=False, export_lights=False, export_cameras=False)

# Far LOD (same rig + clips, fewer triangles)
far = ob.copy(); far.data = ob.data.copy(); scn.collection.objects.link(far); far.name = MID + '-lod'
# Keep armature modifier
if not any(m.type == 'ARMATURE' for m in far.modifiers):
    m = far.modifiers.new('Armature', 'ARMATURE'); m.object = arm_ob
decimate(far, FAR_TRIS)
print('FAR_TRIS', tris(far), flush=True)

# First-person body: strip the head / mask (verts near or above the neck, or weighted to head/neck)
body = ob.copy(); body.data = ob.data.copy(); scn.collection.objects.link(body); body.name = MID + '-body'
if not any(m.type == 'ARMATURE' for m in body.modifiers):
    m = body.modifiers.new('Armature', 'ARMATURE'); m.object = arm_ob
head_groups = {body.vertex_groups[n].index for n in ('head', 'neck') if body.vertex_groups.get(n)}
bm = bmesh.new(); bm.from_mesh(body.data); bm.verts.ensure_lookup_table()
# Need vertex group lookup from original mesh indices; bmesh verts keep index until ops
kill = []
for v in bm.verts:
    src = body.data.vertices[v.index]
    p = body.matrix_world @ src.co
    whead = sum(g.weight for g in src.groups if g.group in head_groups)
    if p.z > .82 * H or whead > .45:
        kill.append(v)
bmesh.ops.delete(bm, geom=kill, context='VERTS')
bm.to_mesh(body.data); bm.free(); body.data.update()
print('BODY_TRIS', tris(body), 'removed_head_verts', len(kill), flush=True)

export_pair(ob, os.path.join(OUT, MID + '.gltf'))
export_pair(far, os.path.join(OUT, MID + '-lod.gltf'))
export_pair(body, os.path.join(OUT, MID + '-body.gltf'))

# 512 px phone textures are written after Blender exits (system Pillow).
meta = {
    'id': MID, 'height': H, 'sourceTris': src_tris, 'nearTris': tris(ob), 'farTris': tris(far), 'bodyTris': tris(body),
    'unweightedFixed': unweighted, 'limbWeightsCleaned': cleaned, 'legSideFixed': side_fixed, 'legWebFacesCut': webs_cut,
    'armsOutRest': sorted(ARMS_OUT), 'clips': ['Idle', 'Walk', 'Run', 'Ride', 'Sit', 'Jump'],
    'walkCycleSec': WALK_FRAMES / 24, 'strideMetersPerCycle': stride_for(H, MID)
}
Path(OUT, 'build-meta.json').write_text(json.dumps(meta, indent=2))
print('PLAYER_DONE', json.dumps(meta), flush=True)

# QA renders
if QA:
    os.makedirs(QA, exist_ok=True)
    scn.render.engine = 'BLENDER_WORKBENCH'; scn.display.shading.color_type = 'TEXTURE'; scn.display.shading.light = 'STUDIO'
    scn.render.resolution_x, scn.render.resolution_y = 480, 640
    bpy.ops.object.camera_add(); cam = bpy.context.object; scn.camera = cam; cam.data.type = 'ORTHO'; cam.data.ortho_scale = H * 1.2
    w = bpy.data.worlds.new('w'); scn.world = w
    # Hide lod/body for clean stills of the near mesh
    far.hide_render = True; body.hide_render = True; far.hide_viewport = True; body.hide_viewport = True
    arm_ob.animation_data.use_nla = False
    shots = [
        ('front_rest', None, 0, (0, -6, H / 2), (90, 0, 0)),
        ('side_rest', None, 0, (6, 0, H / 2), (90, 0, 90)),
        ('front_walk6', A_walk, 6, (0, -6, H / 2), (90, 0, 0)),
        ('side_walk0', A_walk, 0, (6, 0, H / 2), (90, 0, 90)),
        ('side_walk6', A_walk, 6, (6, 0, H / 2), (90, 0, 90)),
        ('front_run6', A_run, 6, (0, -6, H / 2), (90, 0, 0)),
        ('side_run6', A_run, 6, (6, 0, H / 2), (90, 0, 90)),
        ('side_ride', A_ride, 0, (6, 0, H / 2), (90, 0, 90)),
        ('front_idle24', A_idle, 24, (0, -6, H / 2), (90, 0, 0)),
    ]
    for tag, act, fr, loc, rot in shots:
        arm_ob.animation_data.action = act; scn.frame_set(fr)
        if act is None:
            for pb in arm_ob.pose.bones: pb.matrix_basis = Matrix.Identity(4)
        cam.location = loc; cam.rotation_euler = tuple(math.radians(r) for r in rot)
        scn.render.filepath = os.path.join(QA, f'{MID}_{tag}.png'); bpy.ops.render.render(write_still=True)
