"""Untangle hands from thighs in the auto-rigged scans (no Blender needed).

Several scans stand with a hand resting on or touching the thigh, so the automatic weights glue some hand
vertices to the leg (or leg vertices to the hand). With a real stride the knee then drags a lump of hand
forward. This reassigns vertices that sit right on the hand/forearm (and clearly away from the leg axis)
to the arm, and vice versa. Idempotent; rewrites JOINTS_0/WEIGHTS_0 in place in <model>.bin.

python3 scripts/city-citizens/fix_limb_weights.py client/assets/citizens [model-id ...] [--dry]
"""
import json
import sys
from pathlib import Path

import numpy as np


def quat_mat(q):
    x, y, z, w = q
    return np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
                     [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
                     [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])


def seg_dist(p, a, b):
    ab = b - a
    t = np.clip(((p - a) @ ab) / max(1e-9, ab @ ab), 0, 1)
    return np.linalg.norm(p - (a + t[:, None] * ab), axis=1)


def fix(assets, model, dry):
    path = assets / f'{model}.gltf'
    g = json.loads(path.read_text())
    prim = g['meshes'][0]['primitives'][0]
    acc = lambda k: g['accessors'][prim['attributes'][k]]
    binp = assets / g['buffers'][0]['uri']
    data = bytearray(binp.read_bytes())

    def view(a, dtype, comps):
        bv = g['bufferViews'][a['bufferView']]
        off = bv.get('byteOffset', 0) + a.get('byteOffset', 0)
        return np.frombuffer(data, dtype=dtype, count=a['count'] * comps, offset=off).reshape(-1, comps)
    pos = view(acc('POSITION'), np.float32, 3)
    jt = view(acc('JOINTS_0'), np.uint8 if acc('JOINTS_0')['componentType'] == 5121 else np.uint16, 4).copy()
    wt = view(acc('WEIGHTS_0'), np.float32, 4).copy()

    nodes = g['nodes']
    parents = {c: i for i, n in enumerate(nodes) for c in n.get('children', [])}
    cache = {}

    def world(i):
        if i in cache:
            return cache[i]
        n = nodes[i]
        m = np.eye(4)
        m[:3, :3] = quat_mat(n.get('rotation', (0, 0, 0, 1))) * np.array(n.get('scale', (1, 1, 1)))
        m[:3, 3] = n.get('translation', (0, 0, 0))
        if i in parents:
            m = world(parents[i]) @ m
        cache[i] = m
        return m
    joints = g['skins'][0]['joints']
    name = {nodes[j]['name']: k for k, j in enumerate(joints)}
    head = {n: world(joints[k])[:3, 3] for n, k in name.items()}
    arm_ids, leg_ids, changed = {}, set(), 0
    for s in 'LR':
        leg_ids |= {name['thigh.' + s], name['shin.' + s]}
    for s in 'LR':
        fa, hd = head['forearm.' + s], head['hand.' + s]
        tip = hd + (hd - fa) * .45
        d_hand = np.minimum(seg_dist(pos, hd, tip), seg_dist(pos, fa + (hd - fa) * .6, hd))
        d_fore = seg_dist(pos, fa, hd)
        d_leg = np.min([seg_dist(pos, head['thigh.' + t], head['shin.' + t]) for t in 'LR'] +
                       [seg_dist(pos, head['shin.' + t], head['foot.' + t]) for t in 'LR'], axis=0)
        leg_w = np.sum(np.where(np.isin(jt, list(leg_ids)), wt, 0), axis=1)
        arm_set = [name['hand.' + s], name['forearm.' + s]]
        arm_w = np.sum(np.where(np.isin(jt, arm_set), wt, 0), axis=1)
        # arm vertices glued to a leg
        bad = (leg_w > .05) & (np.minimum(d_hand, d_fore) < .05) & (np.minimum(d_hand, d_fore) < .5 * d_leg)
        # leg vertices glued to a hand
        bad2 = (arm_w > .05) & (d_leg < .5 * np.minimum(d_hand, d_fore)) & (np.minimum(d_hand, d_fore) > .06)
        for v in np.nonzero(bad)[0]:
            b = name['hand.' + s] if d_hand[v] <= d_fore[v] else name['forearm.' + s]
            jt[v] = (b, 0, 0, 0); wt[v] = (1, 0, 0, 0); changed += 1
        for v in np.nonzero(bad2)[0]:
            keep = [(j, w) for j, w in zip(jt[v], wt[v]) if j not in arm_set and w > 0]
            tot = sum(w for _, w in keep)
            if not keep or tot <= 0:
                continue
            keep += [(0, 0.)] * (4 - len(keep))
            jt[v] = [j for j, _ in keep[:4]]; wt[v] = [w / tot for _, w in keep[:4]]; changed += 1
    print(f'{model}: {changed} vertices untangled', flush=True)
    if dry or not changed:
        return
    for k, arr in (('JOINTS_0', jt), ('WEIGHTS_0', wt)):
        a = acc(k); bv = g['bufferViews'][a['bufferView']]
        off = bv.get('byteOffset', 0) + a.get('byteOffset', 0)
        raw = arr.astype(np.uint8 if a['componentType'] == 5121 else (np.uint16 if k == 'JOINTS_0' else np.float32)).tobytes()
        data[off:off + len(raw)] = raw
    binp.write_bytes(bytes(data))


args = [a for a in sys.argv[1:] if not a.startswith('--')]
assets = Path(args[0]).resolve()
for m in args[1:] or [m['id'] for m in json.loads((assets / 'models.json').read_text())['models']]:
    fix(assets, m, '--dry' in sys.argv)
