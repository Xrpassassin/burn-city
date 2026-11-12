"""Pack a citizen mesh and evaluated frames for the instanced City renderer."""
import json
import struct


def sample_mesh(obj, depsgraph):
    evaluated = obj.evaluated_get(depsgraph)
    mesh = evaluated.to_mesh()
    sample = ([v.co.copy() for v in mesh.vertices], [v.normal.copy() for v in mesh.vertices])
    evaluated.to_mesh_clear()
    return sample


def write_vat(path, mesh, frames, meta):
    fm = mesh; fm.calc_loop_triangles(); uvl = fm.uv_layers.active.data
    key = {}; verts = []; idx = []
    for lt in fm.loop_triangles:
        for li in lt.loops:
            vi = fm.loops[li].vertex_index; uv = tuple(round(c, 5) for c in uvl[li].uv)
            k = (vi, uv)
            if k not in key: key[k] = len(verts); verts.append(k)
            idx.append(key[k])
    conv = lambda c: (c.x, c.z, -c.y)  # Blender Z-up -> three Y-up
    allp = [conv(frames[f][0][vi]) for f in range(len(frames)) for vi, _ in verts]
    mn = [min(p[i] for p in allp) for i in range(3)]; mx = [max(p[i] for p in allp) for i in range(3)]; sz = [mx[i] - mn[i] for i in range(3)]
    nv = len(verts); buf = bytearray()
    for vi, uv in verts: buf += struct.pack('<ff', uv[0], 1 - uv[1])
    uv_bytes = len(buf)
    for i in idx: buf += struct.pack('<H', i)
    while len(buf) % 4: buf += b'\0'
    pos_off = len(buf)
    for f in range(len(frames)):
        for vi, _ in verts:
            p = conv(frames[f][0][vi]); buf += struct.pack('<hhh', *[int(round((p[i] - mn[i]) / sz[i] * 65535 - 32768)) for i in range(3)])
    nrm_off = len(buf)
    for f in range(len(frames)):
        for vi, _ in verts:
            n = conv(frames[f][1][vi]); buf += struct.pack('<bbb', *[max(-127, min(127, int(round(c * 127)))) for c in n])
    meta.update(verts=nv, indices=len(idx), frames=len(frames), uvOffset=0,
                idxOffset=uv_bytes, posOffset=pos_off, nrmOffset=nrm_off, min=mn, size=sz, tris=len(idx) // 3)
    path.with_suffix('.bin').write_bytes(buf)
    path.with_suffix('.json').write_text(json.dumps(meta, indent=1) + '\n')
