# Blender 4.2 (headless):  blender -b --factory-startup -P build_citizen.py -- <src_dir> <id> <height_m> <out_dir> [qa_dir]
# Turns one CC BY Sketchfab photoscan (unrigged, single mesh) into:
#   <id>.gltf(+.bin, <id>-tex/*.webp)  near LOD (separate files: the City CSP blocks blob: URLs) (<=10k tris), simple humanoid armature, automatic weights, in-house Walk + Idle clips
#   <id>.far.bin/json + <id>.far.webp   far LOD (~1.2k tris) with the Walk cycle baked into a vertex-animation table
# All motion is authored procedurally here (no third-party animation data).
import bpy, sys, json, math, os
from pathlib import Path
from mathutils import Matrix, Vector
sys.path.insert(0, os.path.dirname(__file__))
from citizen_gait import WALK_FRAMES, make_walk, stride_for
from citizen_vat import sample_mesh, write_vat
a = sys.argv[sys.argv.index('--') + 1:]
SRC, MID, HEIGHT, OUT = a[0], a[1], float(a[2]), a[3]
QA = a[4] if len(a) > 4 else None
NEAR_TRIS, FAR_TRIS, FAR_FRAMES = 9000, 1200, 16
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

# ---- normalise: feet at z=0, height = HEIGHT, hips centred on origin
vs = [v.co.copy() for v in ob.data.vertices]
zmin = min(v.z for v in vs); zmax = max(v.z for v in vs); s = HEIGHT / (zmax - zmin)
mid = [v for v in vs if zmin + .45 * (zmax - zmin) < v.z < zmin + .6 * (zmax - zmin)]
cx = sum(v.x for v in mid) / len(mid); cy = sum(v.y for v in mid) / len(mid)
for v in ob.data.vertices: v.co = Vector(((v.co.x - cx) * s, (v.co.y - cy) * s, (v.co.z - zmin) * s))
H = HEIGHT

def tris(o): return sum(len(p.vertices) - 2 for p in o.data.polygons)
def decimate(o, target):
    m = o.modifiers.new('dec', 'DECIMATE'); m.ratio = min(1, target / max(1, tris(o))); m.use_collapse_triangulate = True
    bpy.context.view_layer.objects.active = o; bpy.ops.object.modifier_apply(modifier='dec')
src_tris = tris(ob)
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.mesh.remove_doubles(threshold=.0005 * H); bpy.ops.mesh.delete_loose(); bpy.ops.object.mode_set(mode='OBJECT')
decimate(ob, NEAR_TRIS)
bpy.ops.object.shade_smooth()

# ---- materials: base colour only (1024); drop normal / emissive / metal-rough (constant rough 0.8)
mat = ob.data.materials[0]; nt = mat.node_tree
bsdf = next((n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'), None)
if bsdf is None:  # e.g. KHR_materials_unlit scans: rebuild as a lit PBR material around the same base colour image
    img = next(n.image for n in nt.nodes if n.type == 'TEX_IMAGE' and n.image)
    mat = bpy.data.materials.new(MID + '_mat'); mat.use_nodes = True; nt = mat.node_tree
    bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'); tn = nt.nodes.new('ShaderNodeTexImage'); tn.image = img
    nt.links.new(tn.outputs['Color'], bsdf.inputs['Base Color']); ob.data.materials[0] = mat
base_img = None
for inp in ['Emission Color', 'Metallic', 'Roughness']:
    for l in list(bsdf.inputs[inp].links): nt.links.remove(l)
bsdf.inputs['Metallic'].default_value = 0; bsdf.inputs['Roughness'].default_value = .8
bsdf.inputs['Emission Strength'].default_value = 0
for n in nt.nodes:
    if n.type == 'TEX_IMAGE' and n.image:
        nm = n.image.name.lower()
        if 'basecolor' in nm: base_img = n.image; n.image.scale(1024, 1024); nt.nodes.active = n
        elif 'normal' in nm: nt.nodes.remove(n)  # scan normal maps are near-flat: drop them (saves ~1.4 MB GPU per model)
for n in list(nt.nodes):
    if n.type == 'TEX_IMAGE' and n.image and not n.outputs['Color'].links: nt.nodes.remove(n)

# ---- joint estimation from the mesh itself (works for arms-down / mid-stride scans)
P = [ob.matrix_world @ v.co for v in ob.data.vertices]
def cen(z0, z1, f=lambda p: True):
    q = [p for p in P if z0 * H <= p.z < z1 * H and f(p)]
    if not q: return None
    return Vector((sum(p.x for p in q) / len(q), sum(p.y for p in q) / len(q), (z0 + z1) / 2 * H))
J = {}
core = lambda p: abs(p.x) < .07 * H
J['pelvis'] = cen(.50, .54, core); J['spine'] = cen(.62, .64, core); J['chest'] = cen(.72, .74, core)
J['neck'] = cen(.84, .86, core); J['head'] = cen(.88, .90, core); J['top'] = Vector((J['head'].x, J['head'].y, H))
def two(z0, z1, prevL, prevR):
    # split a horizontal slice of both legs into two clusters (k-means in x/y) and match them to the joints above,
    # so legs that cross the midline in a mid-stride scan keep the correct side
    q = [p for p in P if z0 * H <= p.z < z1 * H and abs(p.x) < .16 * H]
    cL, cR = prevL.xy.copy(), prevR.xy.copy()
    for _ in range(12):
        A = [p for p in q if (p.xy - cL).length <= (p.xy - cR).length]; B = [p for p in q if (p.xy - cL).length > (p.xy - cR).length]
        if not A or not B: break
        cL = Vector((sum(p.x for p in A) / len(A), sum(p.y for p in A) / len(A))); cR = Vector((sum(p.x for p in B) / len(B), sum(p.y for p in B) / len(B)))
    z = (z0 + z1) / 2 * H
    return Vector((cL.x, cL.y, z)), Vector((cR.x, cR.y, z))
J['hipL'] = cen(.46, .49, lambda p: .005 * H < p.x < .14 * H); J['hipR'] = cen(.46, .49, lambda p: -.14 * H < p.x < -.005 * H)
J['kneeL'], J['kneeR'] = two(.27, .30, J['hipL'], J['hipR'])
J['ankleL'], J['ankleR'] = two(.045, .07, J['kneeL'], J['kneeR'])
for side, sg in (('L', 1), ('R', -1)):
    J['toe' + side] = J['ankle' + side] + Vector((0, -.075 * H, -.04 * H))
ARMS_OUT = {}
for side, sg in (('L', 1), ('R', -1)):
    def arm(z0, z1):
        q = [p for p in P if z0 * H <= p.z < z1 * H and sg * p.x > 0]
        ext = max(sg * p.x for p in q)
        return cen(z0, z1, lambda p: sg * p.x > ext - .045 * H)
    band = [p for p in P if .48 * H < p.z < .86 * H and sg * p.x > 0]
    reach = max(sg * p.x for p in band); print('REACH', side, round(reach / H, 3))
    if reach > .30 * H:  # T/A-pose scan: arms stick out sideways, sample the arm along x instead of z
        ARMS_OUT[side] = True
        def armx(f):
            x0 = .12 * H + f * (reach - .12 * H); q = [p for p in P if abs(sg * p.x - x0) < .02 * H and p.z > .55 * H]
            return Vector((sum(p.x for p in q) / len(q), sum(p.y for p in q) / len(q), sum(p.z for p in q) / len(q)))
        J['shoulder' + side] = Vector((sg * .105 * H, J['chest'].y, .815 * H)); J['elbow' + side] = armx(.42); J['wrist' + side] = armx(.82)
        J['hand' + side] = J['wrist' + side] + (J['wrist' + side] - J['elbow' + side]).normalized() * .07 * H
        continue
    sh = arm(.80, .82); sh.x -= sg * .035 * H
    J['shoulder' + side] = sh; J['elbow' + side] = arm(.61, .63); J['wrist' + side] = arm(.47, .49)
    if sg * J['elbow' + side].x < .09 * H: J['elbow' + side].x = sh.x
    J['hand' + side] = J['wrist' + side] + Vector((0, 0, -.07 * H))

# ---- armature
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

# ---- skin: automatic (bone heat) weights, nearest-bone fallback for anything left unweighted
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

# limbs: drop arm/leg weights on vertices that are far from that limb (stops hands dragging hips/pants)
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
        b = min(arm_ob.data.bones, key=lambda b: segd(p, b) + (1 if b.name in limb else 0) * 0)
        ob.vertex_groups.get(b.name).add([v.index], 1.0, 'REPLACE') if ob.vertex_groups.get(b.name) else ob.vertex_groups.new(name=b.name).add([v.index], 1.0, 'REPLACE')

# legs: a vertex below the hips belongs to ONE leg chain (stops a shoe smearing to the other foot when feet are close)
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

# delete faces that weld the two lower legs/feet together (touching shoes or straps in the scan)
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

# T/A-pose scans: swing the arms down to the sides and make that the new rest pose
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

# ---- in-house procedural clips (+angle about world X: bone top tips forward / hanging bone swings back)
D = math.radians
def keyclip(name, frames, fn):
    act = bpy.data.actions.new(name); act.use_fake_user = True; arm_ob.animation_data_create(); arm_ob.animation_data.action = act
    for pb in arm_ob.pose.bones: pb.rotation_mode = 'XYZ'
    for f in range(frames + 1):
        for pb in arm_ob.pose.bones: pb.rotation_euler = (0, 0, 0); pb.location = (0, 0, 0)
        fn(f / frames * 2 * math.pi)
        for pb in arm_ob.pose.bones:
            pb.rotation_quaternion = pb.rotation_euler.to_quaternion()
            pb.keyframe_insert('rotation_quaternion', frame=f); pb.keyframe_insert('location', frame=f)
    for pb in arm_ob.pose.bones: pb.rotation_mode = 'QUATERNION'
    return act
PB = arm_ob.pose.bones
def idle(p):
    PB['spine'].rotation_euler.x = D(1.2) * math.sin(p); PB['chest'].rotation_euler.x = D(1) * math.sin(p + .6)
    PB['hips'].location.y = .004 * math.sin(p); PB['head'].rotation_euler.y = D(6) * math.sin(p * .5)
    for s, sg in (('L', 1), ('R', -1)):
        PB['upperarm.' + s].rotation_euler.x = D(1.5) * math.sin(p + sg); PB['forearm.' + s].rotation_euler.x = -D(6)
scn = bpy.context.scene; scn.render.fps = 24
A_idle = keyclip('Idle', 48, idle)
A_walk = make_walk(arm_ob, H, MID)
for fc in A_idle.fcurves:
    for k in fc.keyframe_points: k.interpolation = 'LINEAR'
for act in (A_walk, A_idle):
    tr = arm_ob.animation_data.nla_tracks.new(); tr.name = act.name; tr.strips.new(act.name, 0, act)
arm_ob.animation_data.action = None

# ---- far LOD: duplicate near skin, decimate, bake Walk into vertex table
far = ob.copy(); far.data = ob.data.copy(); scn.collection.objects.link(far); far.name = MID + '_far'
decimate(far, FAR_TRIS)
arm_ob.animation_data.use_nla = False
def frames_of(act, n, span):
    arm_ob.animation_data.action = act
    res = []
    for i in range(n):
        frame = i * span / n
        scn.frame_set(int(frame), subframe=frame % 1)
        res.append(sample_mesh(far, bpy.context.evaluated_depsgraph_get()))
    return res
F = frames_of(A_walk, FAR_FRAMES, WALK_FRAMES) + frames_of(A_idle, 1, 48)
arm_ob.animation_data.action = None; scn.frame_set(0)
arm_ob.animation_data.use_nla = True
if base_img:
    fi = base_img.copy(); fi.scale(256, 256); fi.filepath_raw = os.path.join(OUT, MID + '.far.webp'); fi.file_format = 'WEBP'; fi.save()
meta = {'id': MID, 'walkFrames': FAR_FRAMES, 'idleFrame': FAR_FRAMES,
        'nearTris': tris(ob), 'sourceTris': src_tris, 'height': H, 'unweightedFixed': unweighted, 'limbWeightsCleaned': cleaned, 'legSideFixed': side_fixed, 'legWebFacesCut': webs_cut, 'armsOutRest': sorted(ARMS_OUT),
        'walkCycleSec': WALK_FRAMES / 24, 'strideMetersPerCycle': stride_for(H, MID)}
write_vat(Path(OUT) / (MID + '.far.json'), far.data, F, meta)
bpy.data.objects.remove(far)

# ---- near LOD export
for o in bpy.context.scene.objects: o.select_set(False)
ob.select_set(True); arm_ob.select_set(True)
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, MID + '.gltf'), export_format='GLTF_SEPARATE', export_texture_dir=MID + '-tex', use_selection=True,
    export_image_format='WEBP', export_image_quality=80, export_animation_mode='NLA_TRACKS', export_force_sampling=True,
    export_def_bones=False, export_optimize_animation_size=True, export_texcoords=True, export_normals=True,
    export_tangents=False, export_yup=True, export_skins=True, export_morph=False, export_lights=False, export_cameras=False)
print('CITIZEN_DONE', json.dumps(meta))

# ---- QA renders (workbench, texture colours): front/side in rest, walk contact and passing
if QA:
    os.makedirs(QA, exist_ok=True)
    scn.render.engine = 'BLENDER_WORKBENCH'; scn.display.shading.color_type = 'TEXTURE'; scn.display.shading.light = 'STUDIO'
    scn.render.resolution_x, scn.render.resolution_y = 360, 480
    bpy.ops.object.camera_add(); cam = bpy.context.object; scn.camera = cam; cam.data.type = 'ORTHO'; cam.data.ortho_scale = H * 1.15
    w = bpy.data.worlds.new('w'); scn.world = w
    arm_ob.animation_data.use_nla = False
    for tag, act, fr, loc, rot in [('front_rest', None, 0, (0, -6, H / 2), (90, 0, 0)), ('side_walk0', A_walk, 0, (6, 0, H / 2), (90, 0, 90)),
                                   ('side_walk6', A_walk, 6, (6, 0, H / 2), (90, 0, 90)), ('front_walk6', A_walk, 6, (0, -6, H / 2), (90, 0, 0))]:
        arm_ob.animation_data.action = act; scn.frame_set(fr)
        if act is None:
            for pb in arm_ob.pose.bones: pb.matrix_basis = Matrix.Identity(4)
        cam.location = loc; cam.rotation_euler = tuple(math.radians(r) for r in rot)
        scn.render.filepath = os.path.join(QA, f'{MID}_{tag}.png'); bpy.ops.render.render(write_still=True)
