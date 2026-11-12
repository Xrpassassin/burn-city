"""Author a distance-driven walk for the existing scans, facing Blender -Y."""
import math
import bpy
from mathutils import Matrix, Vector

WALK_FRAMES = 24
STANCE = .60


def stride_for(height, model):
    scale = {'gothic-elegance': .84, 'elegance-black-b': .89, 'athletic-black': 1.04}
    return 1.17 * height / 1.75 * scale.get(model, 1)


def make_walk(rig, height, model):
    bones = rig.pose.bones
    rest = {b.name: b.bone.matrix_local.copy() for b in bones}
    ankles = [rest['foot.' + side].translation for side in 'LR']
    hips = [rest['thigh.' + side].translation for side in 'LR']
    center = (ankles[0] + ankles[1]) / 2
    # Keep the stance width near the hip joints, even on scans posed mid-stride.
    width = max(.041 * height, min(.057 * height, abs(hips[0].x - hips[1].x) * .37))
    stride = stride_for(height, model)
    action = bpy.data.actions.new('Walk')
    action.use_fake_user = True
    rig.animation_data_create()
    rig.animation_data.action = action
    previous = {}

    def rotate(name, axis, angle):
        basis = rest[name].to_3x3().inverted()
        bones[name].rotation_quaternion = Matrix.Rotation(angle, 3, basis @ Vector(axis)).to_quaternion()

    def aim(bone, start, direction):
        # Carry the joint's rest roll along as it aims at the next joint.
        parent_delta = bone.parent.matrix @ rest[bone.parent.name].inverted()
        base = parent_delta @ rest[bone.name]
        turn = (base.to_3x3() @ Vector((0, 1, 0))).rotation_difference(direction)
        posed = turn.to_matrix().to_4x4() @ base
        posed.translation = start
        bone.matrix = posed
        bpy.context.view_layer.update()

    for frame in range(WALK_FRAMES + 1):
        phase = frame % WALK_FRAMES / WALK_FRAMES
        swing = math.sin(math.tau * phase)
        for b in bones:
            b.rotation_mode = 'QUATERNION'
            b.matrix_basis = Matrix.Identity(4)
        bones['hips'].location = rest['hips'].to_3x3().inverted() @ Vector((
            .006 * height * swing, 0, height * (-.035 - .006 * math.cos(2 * math.tau * (phase - .05)))))
        rotate('hips', (0, 0, 1), .045 * swing)
        rotate('chest', (0, 0, 1), -.065 * swing)
        rotate('spine', (1, 0, 0), .035)
        rotate('head', (1, 0, 0), -.025)
        bpy.context.view_layer.update()
        for i, side in enumerate('LR'):
            p = (phase + i * .5) % 1
            sign = 1 if i == 0 else -1
            thigh, shin, foot = (bones[f'{joint}.{side}'] for joint in ('thigh', 'shin', 'foot'))
            # The stance ankle moves backward exactly as far as the NPC moves forward.
            # The swing reverses smoothly and clears the ground between contact poses.
            y = (p - STANCE / 2) * stride
            lift = pitch = 0
            if p >= STANCE:
                u = (p - STANCE) / (1 - STANCE)
                y -= stride * u * u * (3 - 2 * u)
                lift = .056 * height * math.sin(math.pi * u) ** 1.6
                pitch = -.17 * math.sin(math.tau * u)
            ankle = Vector((center.x + sign * width, center.y + y, ankles[i].z + lift))
            hip = thigh.head.copy()
            ray = ankle - hip
            direction = ray.normalized()
            upper = (rest[shin.name].translation - rest[thigh.name].translation).length
            lower = (rest[foot.name].translation - rest[shin.name].translation).length
            reach = min(ray.length, upper + lower - .001)
            along = (upper * upper - lower * lower + reach * reach) / (2 * reach)
            forward = Vector((0, -1, 0))
            bend = (forward - direction * forward.dot(direction)).normalized()
            knee = hip + direction * along + bend * math.sqrt(max(0, upper * upper - along * along))
            aim(thigh, hip, knee - hip)
            aim(shin, knee, hip + direction * reach - knee)
            foot_pose = Matrix.Rotation(pitch, 4, 'X') @ rest[foot.name]
            foot_pose.translation = foot.head
            foot.matrix = foot_pose

            # Keep the pocket-side arm and the hand with the keys close to their scan pose.
            held = (model == 'casual-m-b' and side == 'R') or (model == 'keys-portrait' and side == 'R')
            arm = 'upperarm.' + side
            forearm = 'forearm.' + side
            arm_direction = rest[forearm].translation - rest[arm].translation
            rest_pitch = math.atan2(arm_direction.y, -arm_direction.z)
            arm_swing = math.cos(math.tau * (p - .05))
            rotate(arm, (1, 0, 0), (.038 * arm_swing if held else .20 * arm_swing - .68 * rest_pitch))
            rotate(forearm, (1, 0, 0), 0 if held else -.07 - .055 * arm_swing)

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
