"""Author a distance-driven walk for the existing scans, facing Blender -Y.

One shared, physically based cycle (heel strike -> foot flat -> heel rise -> toe-off -> swing) with
per-model gait parameters (GAIT below): stride, stance width, pelvis list/rotation/shift, bob,
posture, shoulder counter-rotation, arm swing and elbow lag, and heel versus flat foot roll.
Every planted point (heel, sole, ball) moves backward exactly at ground speed, so with the runtime's
distance-driven phase the feet do not slide.
"""
import math
import bpy
from mathutils import Matrix, Vector

WALK_FRAMES = 24

# Base profiles. Men: upright chest, shoulders back, long relaxed stride, full arm swing, slight swagger.
# Women: runway-style but realistic: feet near one line, more pelvis list and rotation, light rhythmic step.
# Heels push that further (narrower line, straighter knee at contact, smaller heel strike, shorter step).
BASE = {
    'm': dict(stride=1.40, stance=.61, width=.050, bob=.011, sink=.012, shift=.010, list=.050, yaw=.085,
              chest_yaw=.105, chest_list=.030, lean=.020, chest_up=.045, head=-.035, arm=.30, arm_fwd=.08,
              elbow=.16, elbow_swing=.14, abduct=.07, heel=.26, toe=.34, lift=.050, arc=.010),
    'f': dict(stride=1.30, stance=.60, width=.026, bob=.010, sink=.010, shift=.016, list=.085, yaw=.120,
              chest_yaw=.070, chest_list=.045, lean=.010, chest_up=.030, head=-.025, arm=.22, arm_fwd=.06,
              elbow=.20, elbow_swing=.12, abduct=.035, heel=.24, toe=.40, lift=.046, arc=.014),
}
HEELS = dict(stride=1.20, stance=.62, width=.014, bob=.007, sink=.006, shift=.020, list=.105, yaw=.140,
             heel=.10, toe=.26, lift=.040, arc=.018)
# Per model: sex, footwear and small personal differences (outfit, build).
GAIT = {
    'casual-w': dict(sex='f'),                                            # sneakers, jeans: relaxed, sporty
    'blonde-black': dict(sex='f', stride=1.26, list=.095, yaw=.13),       # ankle boots
    'elegance-black-b': dict(sex='f', heels=True),                        # stilettos: full runway line
    'gothic-elegance': dict(sex='f', heels=True, stride=1.14, list=.10),  # platform heels, long coat
    'athletic-black': dict(sex='f', stride=1.36, bob=.012, arm=.26, width=.030),  # trainers: brisk
    'exec-navy': dict(sex='m', stride=1.38, arm=.26, chest_yaw=.09),      # suit: confident, a touch reserved
    'trekker': dict(sex='m', width=.055, bob=.012),          # boots: long easy stride
    'casual-m-b': dict(sex='m', hold='R'),                                # right hand in pocket
    'keys-portrait': dict(sex='m', hold='R', chest_yaw=.12),              # keys in right hand, swagger
    'inked-warrior': dict(sex='m', stride=1.44, width=.058, abduct=.10, chest_yaw=.12, arm=.32),  # broad build
}


def gait_for(model):
    g = GAIT.get(model, {'sex': 'm'})
    p = dict(BASE[g['sex']])
    if g.get('heels'):
        p.update(HEELS)
    p.update({k: v for k, v in g.items() if k not in ('sex', 'heels', 'hold')})
    p['hold'] = g.get('hold')
    return p


def stride_for(height, model):
    """Meters travelled per full cycle (two steps). The runtime advances phase by distance / stride."""
    return gait_for(model)['stride'] * height / 1.75


def smooth(u):
    u = max(0., min(1., u))
    return u * u * (3 - 2 * u)


def make_walk(rig, height, model):
    G = gait_for(model)
    bones = rig.pose.bones
    rest = {b.name: b.bone.matrix_local.copy() for b in bones}
    ankles = [rest['foot.' + side].translation.copy() for side in 'LR']
    toes = [bones['foot.' + side].bone.tail_local.copy() for side in 'LR']
    # Scans posed mid-stride have one foot pitched toe-down (heel lifted). Level both feet to the flatter one,
    # so each foot rolls from the same neutral pose (heels keep the shoe's own pitch, since both feet share it).
    def down(i):
        d = toes[i] - ankles[i]
        return math.atan2(-d.z, max(1e-4, -d.y))
    neutral = min(down(0), down(1))
    level = [down(i) - neutral for i in range(2)]
    for i in range(2):
        toes[i] = ankles[i] + Matrix.Rotation(-level[i], 3, 'X') @ (toes[i] - ankles[i])
    center = (ankles[0] + ankles[1]) / 2
    ground = min(min(a.z for a in ankles), min(t.z for t in toes)) - .004 * height
    width = G['width'] * height
    stride = stride_for(height, model)
    stance = G['stance']
    action = bpy.data.actions.new('Walk')
    action.use_fake_user = True
    rig.animation_data_create()
    rig.animation_data.action = action
    previous = {}

    def rotate(name, *pairs):
        basis = rest[name].to_3x3().inverted()
        q = Matrix.Identity(3)
        for axis, angle in pairs:
            q = Matrix.Rotation(angle, 3, basis @ Vector(axis)) @ q
        bones[name].rotation_quaternion = q.to_quaternion()

    def aim(bone, start, direction):
        # Carry the joint's rest roll along as it aims at the next joint.
        parent_delta = bone.parent.matrix @ rest[bone.parent.name].inverted()
        base = parent_delta @ rest[bone.name]
        turn = (base.to_3x3() @ Vector((0, 1, 0))).rotation_difference(direction)
        posed = turn.to_matrix().to_4x4() @ base
        posed.translation = start
        bone.matrix = posed
        bpy.context.view_layer.update()

    # Foot rocker geometry per side, relative to the ankle in rest (Blender -Y is forward).
    foot = []
    for i in range(2):
        a, t = ankles[i], toes[i]
        length = max(.08 * height, (t - a).length)
        heel = Vector((a.x, a.y + .18 * length, ground))           # heel contact point under/behind the ankle
        ball = Vector((a.x + (t.x - a.x) * .80, a.y + (t.y - a.y) * .80, ground))
        foot.append((heel - a, ball - a))

    def ankle_for(i, x, contact_y, kind, pitch):
        """Ankle position whose foot touches the ground at contact_y via the heel ('heel'), sole ('flat') or ball."""
        heel_rel, ball_rel = foot[i]
        rel = heel_rel if kind != 'ball' else ball_rel
        rot = Matrix.Rotation(pitch, 3, 'X')
        pivot = Vector((x, contact_y, ground))
        return pivot - rot @ rel

    hip_y = [rest['thigh.' + sd].translation.y for sd in 'LR']
    foot_mid = sum((f[0].y + f[1].y) / 2 for f in foot) / 2   # heel -> mid-foot offset (heel is behind, +Y)
    # Stance timing (fractions of the stance phase): heel rocker, foot flat, heel rise.
    HS, HR = .14, .55
    to_pitch = G['toe']
    hs_pitch = -G['heel']

    def stance_pose(i, p, x):
        # Heel contact point moves backward at ground speed for the whole stance.
        heel_y = hip_y[i] + (p - stance / 2) * stride - foot_mid  # mid-stance foot centred under its hip joint
        u = p / stance
        if u < HS:      # heel rocker: toe lowers onto the ground about the heel
            pitch = hs_pitch * (1 - smooth(u / HS))
            return ankle_for(i, x, heel_y, 'heel', pitch), pitch
        if u < HR:      # foot flat: the whole sole is planted
            return ankle_for(i, x, heel_y, 'heel', 0.), 0.
        # heel rise / toe-off: pivot about the ball, which is planted where the flat foot left it
        w = (u - HR) / (1 - HR)
        pitch = to_pitch * smooth(w) ** 1.15
        heel_rel, ball_rel = foot[i]
        ball_y = heel_y + (ball_rel.y - heel_rel.y)
        return ankle_for(i, x, ball_y, 'ball', pitch), pitch

    chain = [(rest['shin.' + sd].translation - rest['thigh.' + sd].translation).length +
             (rest['foot.' + sd].translation - rest['shin.' + sd].translation).length for sd in 'LR']

    def leg_target(i, p):
        sign = 1 if i == 0 else -1
        x = center.x + sign * width
        if p < stance:
            return stance_pose(i, p, x)
        # Swing: from the toe-off pose to the next heel strike, with toe clearance and a slight outward arc.
        u = (p - stance) / (1 - stance)
        a0, p0 = stance_pose(i, stance - 1e-4, x)
        a1, p1 = stance_pose(i, 0., x)
        e = u ** 3 * (10 - 15 * u + 6 * u * u)      # minimum-jerk
        ankle = a0.lerp(a1, e)
        ankle.z += G['lift'] * height * math.sin(math.pi * min(1, u * 1.08)) ** 1.4
        ankle.x += sign * G['arc'] * height * math.sin(math.pi * u)
        # Toe drops from push-off, dorsiflexes for clearance, then sets up the heel strike.
        pitch = p0 * (1 - smooth(u / .45)) + (-.12 * math.sin(math.pi * min(1, u / .8))) + p1 * smooth((u - .6) / .4)
        return ankle, pitch

    def pose_trunk(phase, dz):
        c1 = math.cos(math.tau * phase)                    # +1 at left heel strike
        s1 = math.sin(math.tau * phase)                    # +1 at left mid-stance
        for b in bones:
            b.rotation_mode = 'QUATERNION'
            b.matrix_basis = Matrix.Identity(4)
        bones['hips'].location = rest['hips'].to_3x3().inverted() @ Vector((G['shift'] * height * s1, 0, dz))
        # Pelvis rotation forward with the swinging leg, list (swing side drops), slight forward tilt.
        rotate('hips', ((0, 0, 1), -G['yaw'] * c1), ((0, 1, 0), -G['list'] * s1), ((1, 0, 0), -.02))
        # Thorax counter-rotates (shoulders opposite the hips) and counter-lists; chest up, slight lean.
        rotate('spine', ((1, 0, 0), G['lean']), ((0, 0, 1), .45 * G['yaw'] * c1), ((0, 1, 0), .5 * G['list'] * s1))
        rotate('chest', ((1, 0, 0), -G['chest_up']), ((0, 0, 1), G['chest_yaw'] * c1), ((0, 1, 0), G['chest_list'] * s1))
        # Head keeps the gaze level and forward (stabilised against the trunk).
        rotate('neck', ((0, 0, 1), -.35 * G['chest_yaw'] * c1))
        rotate('head', ((1, 0, 0), G['head'] + .5 * G['chest_up']), ((0, 0, 1), -.4 * (G['chest_yaw'] - G['yaw']) * c1),
               ((0, 1, 0), -.35 * G['chest_list'] * s1))
        bpy.context.view_layer.update()

    # Pelvis height from the legs themselves (compass gait): the highest pelvis both legs can reach with the
    # knee almost straight (the scans stand with soft knees, which read as a crouch when walking), then smoothed.
    n = WALK_FRAMES
    cap = []
    for frame in range(n):
        phase = frame / n
        pose_trunk(phase, 0.)
        lim = 1e9
        for i, sd in enumerate('LR'):
            p = (phase + i * .5) % 1
            if p >= stance:      # a swinging leg bends freely; only planted legs limit the pelvis
                continue
            ankle, _ = leg_target(i, p)
            hip = bones['thigh.' + sd].head
            reach = chain[i] * G.get('knee', .992)
            h2 = reach * reach - (ankle.x - hip.x) ** 2 - (ankle.y - hip.y) ** 2
            lim = min(lim, ankle.z + math.sqrt(max(0., h2)) - hip.z)
        cap.append(lim)
    # Same pelvis path for both steps (scans with unequal legs must not limp): the longer leg bends a little more.
    cap = [min(cap[k], cap[(k + n // 2) % n]) for k in range(n)]
    mid = max(cap) - G['sink'] * height
    raw = [min(mid, c) for c in cap]
    dzs = []
    for k in range(n):   # circular smoothing, never above what the legs allow
        avg = sum(raw[(k + j) % n] * w for j, w in ((-2, .1), (-1, .2), (0, .4), (1, .2), (2, .1)))
        dzs.append(min(avg, cap[k]) - .002 * height)
    dzs.append(dzs[0])

    # Rest elbow flexion per side, so every scan ends up with the same relaxed elbow.
    def pitch_of(d):
        return math.atan2(d.y, -d.z)
    elbow_rest = {}
    for sd in 'LR':
        up = rest['forearm.' + sd].translation - rest['upperarm.' + sd].translation
        fo = rest['hand.' + sd].translation - rest['forearm.' + sd].translation
        elbow_rest[sd] = pitch_of(up) - pitch_of(fo)

    for frame in range(WALK_FRAMES + 1):
        phase = frame % WALK_FRAMES / WALK_FRAMES
        pose_trunk(phase, dzs[frame])
        for i, side in enumerate('LR'):
            p = (phase + i * .5) % 1
            sign = 1 if i == 0 else -1
            thigh, shin, foot_bone = (bones[f'{joint}.{side}'] for joint in ('thigh', 'shin', 'foot'))
            ankle, pitch = leg_target(i, p)
            hip = thigh.head.copy()
            ray = ankle - hip
            direction = ray.normalized()
            upper = (rest[shin.name].translation - rest[thigh.name].translation).length
            lower = (rest[foot_bone.name].translation - rest[shin.name].translation).length
            reach = min(ray.length, upper + lower - .0015)
            along = (upper * upper - lower * lower + reach * reach) / (2 * reach)
            forward = Vector((0, -1, 0))
            bend = (forward - direction * forward.dot(direction)).normalized()
            knee = hip + direction * along + bend * math.sqrt(max(0, upper * upper - along * along))
            aim(thigh, hip, knee - hip)
            aim(shin, knee, hip + direction * reach - knee)
            foot_pose = Matrix.Rotation(pitch - level[i], 4, 'X') @ rest[foot_bone.name]
            foot_pose.translation = foot_bone.head
            foot_bone.matrix = foot_pose

            # Arms swing opposite the same-side leg, pendulum-like with the elbow lagging the shoulder.
            held = G['hold'] == side
            arm = 'upperarm.' + side
            forearm = 'forearm.' + side
            arm_direction = rest[forearm].translation - rest[arm].translation
            rest_pitch = math.atan2(arm_direction.y, -arm_direction.z)
            swing = math.cos(math.tau * (p - .04))
            lag = math.cos(math.tau * (p - .12))
            if held:
                rotate(arm, ((1, 0, 0), .04 * swing))
                rotate(forearm)
            else:
                rotate(arm, ((1, 0, 0), G['arm'] * swing - .70 * rest_pitch - G['arm_fwd'] * .3),
                       ((0, 1, 0), -sign * G['abduct']))
                # More elbow flexion as the arm swings forward (negative swing), relaxed when it swings back.
                rotate(forearm, ((1, 0, 0), elbow_rest[side] - G['elbow'] - G['elbow_swing'] * max(0., -lag) * 1.4 + .03 * max(0., lag)))

        for b in bones:
            rotation = b.rotation_quaternion
            if b.name in previous:
                rotation.make_compatible(previous[b.name])
            previous[b.name] = rotation.copy()
            b.keyframe_insert('rotation_quaternion', frame=frame)
        bones['hips'].keyframe_insert('location', frame=frame)

    for curve in action.fcurves:
        for key in curve.keyframe_points:
            key.interpolation = 'LINEAR'
    return action
