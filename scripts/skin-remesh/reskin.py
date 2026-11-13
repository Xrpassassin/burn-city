#!/usr/bin/env python3
# Swap the mesh inside an already-rigged glTF for a cleaner simplified one, keeping the exact rig, skin, clips,
# bone names and materials. Weights are transferred from the old skinned mesh (k nearest vertices that face the same way).
#   python3 reskin.py <template.gltf> <simplified.glb[,part2.glb]> <out.gltf> [--drop-head [--height=1.8]] [--weights-from=<near.gltf>] [--smooth-hips=N] [--removed-from=<pre-edit.gltf>] [--cut-box=x0,x1,y0,y1,z0,z1] [--normals=source|smooth]
# Needs numpy + scipy. Box-only asset tool (not run in CI). See README.md.
import json, struct, sys, os, math
import numpy as np
from scipy.spatial import cKDTree

args = [a for a in sys.argv[1:] if not a.startswith('--')]
flags = {a.split('=')[0]: (a.split('=') + [True])[1] for a in sys.argv[1:] if a.startswith('--')}
TPL, NEW, OUT = args
NORMALS = flags.get('--normals', 'smooth')
CT = {5120: np.int8, 5121: np.uint8, 5122: np.int16, 5123: np.uint16, 5125: np.uint32, 5126: np.float32}
NC = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}

def load(path):
    if path.endswith('.glb'):
        b = open(path, 'rb').read(); n = struct.unpack_from('<I', b, 12)[0]
        g = json.loads(b[20:20 + n]); o = 20 + n; bn = struct.unpack_from('<I', b, o)[0]
        return g, [b[o + 8:o + 8 + bn]]
    g = json.load(open(path)); d = os.path.dirname(path)
    return g, [open(os.path.join(d, x['uri']), 'rb').read() for x in g['buffers']]

def acc(g, bins, i):
    a = g['accessors'][i]; v = g['bufferViews'][a['bufferView']]; n = NC[a['type']]; dt = np.dtype(CT[a['componentType']])
    stride = v.get('byteStride', 0); off = v.get('byteOffset', 0) + a.get('byteOffset', 0); buf = bins[v.get('buffer', 0)]
    if stride and stride != n * dt.itemsize:
        rows = [np.frombuffer(buf, dt, n, off + k * stride) for k in range(a['count'])]; return np.array(rows)
    return np.frombuffer(buf, dt, a['count'] * n, off).reshape(a['count'], n).copy()

def node_world(g, idx):
    parent = {c: i for i, n in enumerate(g['nodes']) for c in n.get('children', [])}
    M = np.eye(4); i = idx
    while i is not None:
        n = g['nodes'][i]
        if 'matrix' in n: L = np.array(n['matrix']).reshape(4, 4).T
        else:
            t = n.get('translation', [0, 0, 0]); s = n.get('scale', [1, 1, 1]); x, y, z, w = n.get('rotation', [0, 0, 0, 1])
            R = np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)], [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)], [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])
            L = np.eye(4); L[:3, :3] = R * np.array(s); L[:3, 3] = t
        M = L @ M; i = parent.get(i)
    return M

# ---- template (rigged)
tg, tb = load(TPL)
tp = tg['meshes'][0]['primitives'][0]
# --weights-from=<near.gltf>: align to / take weights from another export of the same rig (the head-less body uses the near mesh)
wg, wb = load(flags['--weights-from']) if '--weights-from' in flags else (tg, tb)
jn = lambda g: [g['nodes'][j].get('name') for j in g['skins'][0]['joints']]
assert jn(wg) == jn(tg), 'rigs differ'
wp = wg['meshes'][0]['primitives'][0]
Q = acc(wg, wb, wp['attributes']['POSITION']).astype(np.float64)
QN = acc(wg, wb, wp['attributes']['NORMAL']).astype(np.float64)
QJ = acc(wg, wb, wp['attributes']['JOINTS_0']).astype(np.int64)
QW = acc(wg, wb, wp['attributes']['WEIGHTS_0']).astype(np.float64)
NJ = len(tg['skins'][0]['joints'])

# ---- simplified mesh (static, source space)
Ps, PNs, UVs, IDXs = [], [], [], []
for f in NEW.split(','):   # several parts (e.g. head + body simplified separately) are concatenated
    ng, nb = load(f)
    ni = next(i for i, n in enumerate(ng['nodes']) if 'mesh' in n); npm = ng['meshes'][ng['nodes'][ni]['mesh']]['primitives'][0]
    Mw = node_world(ng, ni); base = sum(len(x) for x in Ps)
    Ps.append(acc(ng, nb, npm['attributes']['POSITION']).astype(np.float64) @ Mw[:3, :3].T + Mw[:3, 3])
    PNs.append(acc(ng, nb, npm['attributes']['NORMAL']).astype(np.float64) @ np.linalg.inv(Mw[:3, :3]).T)
    UVs.append(acc(ng, nb, npm['attributes']['TEXCOORD_0']).astype(np.float32))
    IDXs.append(acc(ng, nb, npm['indices']).reshape(-1, 3).astype(np.int64) + base)
P, PN, UV, IDX = np.concatenate(Ps), np.concatenate(PNs), np.concatenate(UVs), np.concatenate(IDXs)

# ---- align source -> template space (yaw candidates, bbox fit, then trimmed ICP on scale + translation)
qt = cKDTree(Q)
def yawm(a): c, s = math.cos(a), math.sin(a); return np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]])
best = None
for k in range(4):
    R = yawm(k * math.pi / 2); X = P @ R.T
    s = (Q[:, 1].max() - Q[:, 1].min()) / (X[:, 1].max() - X[:, 1].min()); X = X * s
    t = np.array([(Q[:, 0].max() + Q[:, 0].min() - X[:, 0].max() - X[:, 0].min()) / 2, Q[:, 1].min() - X[:, 1].min(), (Q[:, 2].max() + Q[:, 2].min() - X[:, 2].max() - X[:, 2].min()) / 2])
    X = X + t; e = qt.query(X)[0].mean() + cKDTree(X).query(Q)[0].mean()
    if best is None or e < best[0]: best = (e, k, R, s, t)
e, k, R, s, t = best
X = (P @ R.T) * s + t
for it in range(25):
    d, j = qt.query(X); keep = d <= np.quantile(d, .9); A, B = X[keep], Q[j[keep]]
    ca, cb = A.mean(0), B.mean(0); ds = ((B - cb) * (A - ca)).sum() / ((A - ca) ** 2).sum()
    X = (X - ca) * ds + cb
d = qt.query(X)[0]
print(f'ALIGN yaw={k * 90} mean={d.mean() * 1000:.2f}mm p95={np.quantile(d, .95) * 1000:.2f}mm', flush=True)
XN = PN @ R.T; XN /= np.linalg.norm(XN, axis=1, keepdims=True) + 1e-12

# ---- weight transfer
K = 8
dd, jj = qt.query(X, K)
dots = (QN[jj] * XN[:, None, :]).sum(-1)
ok = dots > .2; none = ~ok.any(1); ok[none] = True
w = ok / (dd + 2e-3) ** 2
Wd = np.zeros((len(X), NJ))
for a in range(K):
    for c in range(4): np.add.at(Wd, (np.arange(len(X)), QJ[jj[:, a], c]), w[:, a] * QW[jj[:, a], c])
# --smooth-hips=N: N Laplacian passes over the weights between the knees and the waist (welded across UV seams), so coat hems
# hanging over the thighs bend smoothly in Sit/Ride instead of tearing into shards between hip- and thigh-weighted vertices.
if '--smooth-hips' in flags:
    Wd /= Wd.sum(1, keepdims=True) + 1e-12
    Hh = Q[:, 1].max() - Q[:, 1].min(); y0 = Q[:, 1].min()
    band = (X[:, 1] > y0 + .25 * Hh) & (X[:, 1] < y0 + .6 * Hh)
    key = np.round(X / 1e-5).astype(np.int64); _, wid0 = np.unique(key, axis=0, return_inverse=True); wid0 = wid0.ravel()
    e = np.concatenate([IDX[:, [0, 1]], IDX[:, [1, 2]], IDX[:, [2, 0]]]); e = wid0[e]; e = np.concatenate([e, e[:, ::-1]])
    nW = wid0.max() + 1
    for _ in range(int(flags['--smooth-hips'])):
        Ww = np.zeros((nW, NJ)); np.add.at(Ww, wid0, Wd); cnt = np.bincount(wid0, minlength=nW)[:, None]; Ww /= cnt
        S = np.zeros((nW, NJ)); np.add.at(S, e[:, 0], Ww[e[:, 1]]); deg = np.bincount(e[:, 0], minlength=nW)[:, None]
        avg = (Ww + S) / (1 + deg)
        Wd[band] = avg[wid0[band]]
    print('SMOOTH_HIPS verts', int(band.sum()), flush=True)
top = np.argsort(-Wd, 1)[:, :4]; tw = np.take_along_axis(Wd, top, 1); tw[tw < 1e-3 * tw[:, :1]] = 0; tw /= tw.sum(1, keepdims=True)
J4, W4 = top.astype(np.uint8), tw.astype(np.float32)

# ---- --removed-from=<pre-edit.gltf>: the template had parts cut out of its index buffer by hand (e.g. Blackbeard's cutlass);
# drop the new triangles that land on those removed parts (nearest old triangle, sampled at corners + centroids).
if '--removed-from' in flags:
    fg, fb = load(flags['--removed-from']); fp = fg['meshes'][0]['primitives'][0]
    FQ = acc(fg, fb, fp['attributes']['POSITION']).astype(np.float64); FI = acc(fg, fb, fp['indices']).reshape(-1, 3)
    TI = acc(tg, tb, tp['indices']).reshape(-1, 3)
    kept = {tuple(sorted(t)) for t in TI.tolist()}; gone = np.array([tuple(sorted(t)) not in kept for t in FI.tolist()])
    samp = np.concatenate([FQ[FI].mean(1)] + [FQ[FI[:, c]] * .6 + FQ[FI].mean(1) * .4 for c in range(3)]); lab = np.tile(gone, 4)
    _, ix = cKDTree(samp).query(X[IDX].mean(1)); drop = lab[ix]
    IDX = IDX[~drop]; print('REMOVED_PART tris', int(drop.sum()), 'of template-removed', int(gone.sum()), flush=True)
    used = np.unique(IDX); remap = -np.ones(len(X), np.int64); remap[used] = np.arange(len(used))
    X, XN, UV, J4, W4, Wd, IDX = X[used], XN[used], UV[used], J4[used], W4[used], Wd[used], remap[IDX]

# ---- --cut-box=x0,x1,y0,y1,z0,z1: drop triangles whose centroid is inside this box (template mesh space, metres), e.g. a
# prop the model was made holding (Blackbeard's short blade in his right hand).
if '--cut-box' in flags:
    x0, x1, y0, y1, z0, z1 = map(float, flags['--cut-box'].split(','))
    c = X[IDX].mean(1); drop = (c[:, 0] > x0) & (c[:, 0] < x1) & (c[:, 1] > y0) & (c[:, 1] < y1) & (c[:, 2] > z0) & (c[:, 2] < z1)
    IDX = IDX[~drop]; print('CUT_BOX tris', int(drop.sum()), flush=True)
    used = np.unique(IDX); remap = -np.ones(len(X), np.int64); remap[used] = np.arange(len(used))
    X, XN, UV, J4, W4, Wd, IDX = X[used], XN[used], UV[used], J4[used], W4[used], Wd[used], remap[IDX]

# ---- optional first-person body: strip head / mask
if flags.get('--drop-head'):
    names = [tg['nodes'][j].get('name', '') for j in tg['skins'][0]['joints']]
    hj = [i for i, n in enumerate(names) if n in ('head', 'neck')]
    H = float(flags['--height']) if '--height' in flags else Q[:, 1].max() - Q[:, 1].min()
    kill = (X[:, 1] > Q[:, 1].min() + .82 * H) | (Wd[:, hj].sum(1) / (Wd.sum(1) + 1e-12) > .45)
    IDX = IDX[~kill[IDX].any(1)]
    used = np.unique(IDX); remap = -np.ones(len(X), np.int64); remap[used] = np.arange(len(used))
    X, XN, UV, J4, W4, IDX = X[used], XN[used], UV[used], J4[used], W4[used], remap[IDX]
    print('BODY dropped', int(kill.sum()), 'verts', flush=True)

# ---- normals: 'smooth' = area-weighted, welded across UV seams (avoids scan normal noise); 'source' = keep original
if NORMALS == 'smooth':
    key = np.round(X / 1e-5).astype(np.int64); _, wid = np.unique(key, axis=0, return_inverse=True); wid = wid.ravel()
    fn = np.cross(X[IDX[:, 1]] - X[IDX[:, 0]], X[IDX[:, 2]] - X[IDX[:, 0]])
    acc_n = np.zeros((wid.max() + 1, 3))
    for c in range(3): np.add.at(acc_n, wid[IDX[:, c]], fn)
    sm = acc_n[wid]; sm /= np.linalg.norm(sm, axis=1, keepdims=True) + 1e-12
    bad = (sm * XN).sum(1) < 0   # thin double-sided parts: keep the source direction
    sm[bad] = XN[bad]; XN = sm

# ---- write: keep every template accessor except the old mesh's, append the new mesh
old = set(tp['attributes'].values()) | {tp['indices']}
og = json.loads(json.dumps(tg)); keepA = [i for i in range(len(tg['accessors'])) if i not in old]
bin_ = bytearray(); views = []; accs = []; amap = {}
def pad(): 
    while len(bin_) % 4: bin_.append(0)
vmap = {}
for i in keepA:
    a = dict(tg['accessors'][i]); v = tg['bufferViews'][a['bufferView']]
    if a['bufferView'] not in vmap:
        pad(); raw = tb[v.get('buffer', 0)][v.get('byteOffset', 0):v.get('byteOffset', 0) + v['byteLength']]
        nv = {k2: v2 for k2, v2 in v.items() if k2 != 'byteOffset'}; nv['buffer'] = 0; nv['byteOffset'] = len(bin_); bin_ += raw
        vmap[a['bufferView']] = len(views); views.append(nv)
    a['bufferView'] = vmap[a['bufferView']]; amap[i] = len(accs); accs.append(a)
def add(arr, ctype, typ, target=None, minmax=False):
    pad(); raw = np.ascontiguousarray(arr).tobytes(); v = {'buffer': 0, 'byteOffset': len(bin_), 'byteLength': len(raw)}
    if target: v['target'] = target
    bin_.extend(raw); views.append(v)
    a = {'bufferView': len(views) - 1, 'componentType': ctype, 'count': int(arr.shape[0]), 'type': typ}
    if minmax: a['min'] = arr.min(0).tolist(); a['max'] = arr.max(0).tolist()
    accs.append(a); return len(accs) - 1
attrs = {'POSITION': add(X.astype(np.float32), 5126, 'VEC3', 34962, True), 'NORMAL': add(XN.astype(np.float32), 5126, 'VEC3', 34962),
         'TEXCOORD_0': add(UV, 5126, 'VEC2', 34962), 'JOINTS_0': add(J4, 5121, 'VEC4', 34962), 'WEIGHTS_0': add(W4, 5126, 'VEC4', 34962)}
ind = add(IDX.astype(np.uint16 if len(X) < 65536 else np.uint32).ravel(), 5123 if len(X) < 65536 else 5125, 'SCALAR', 34963)
def fix(o):
    if isinstance(o, dict):
        for k2, v2 in list(o.items()):
            if k2 in ('input', 'output', 'inverseBindMatrices') and isinstance(v2, int): o[k2] = amap[v2]
            else: fix(v2)
    elif isinstance(o, list):
        for x in o: fix(x)
fix(og.get('skins', [])); fix(og.get('animations', []))
pr = og['meshes'][0]['primitives'][0]; pr['attributes'] = attrs; pr['indices'] = ind
og['accessors'] = accs; og['bufferViews'] = views
base = os.path.splitext(os.path.basename(OUT))[0]
og['buffers'] = [{'byteLength': len(bin_), 'uri': base + '.bin'}]
og['asset']['generator'] = tg['asset'].get('generator', '') + ' + Burn City reskin (meshoptimizer)'
open(os.path.join(os.path.dirname(OUT) or '.', base + '.bin'), 'wb').write(bin_)
json.dump(og, open(OUT, 'w'), separators=(',', ':'))
print('RESKIN_DONE', OUT, 'tris', len(IDX), 'verts', len(X), 'bin', len(bin_), flush=True)
