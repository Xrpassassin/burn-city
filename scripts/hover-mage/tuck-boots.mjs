// Hover Mage: tuck the source model's boots up inside the robe (they peeked under the hem while floating).
// The Tripo export is one welded shell, so the boots can't be dropped as a node: vertices inside a toe
// ellipse below boot height are collapsed to a point inside the robe (their triangles go degenerate or hide
// behind the hem). Idempotent (moved vertices end above the boot height). Box-only tool, not in CI:
//   node scripts/hover-mage/tuck-boots.mjs client/assets/players/hover-mage/hover-mage.glb [more.glb …]
// build.mjs calls tuckBoots(doc) before writing, so a rebuild keeps the fix.
// Model space (1 unit tall, hem at y = 0, faces +Z): [centre x, centre z, radius x, radius z, max y].
export const BOOTS = Object.freeze([[-0.135, 0.085, 0.058, 0.09, 0.064], [0.135, 0.08, 0.058, 0.09, 0.064]]);

export function tuckBoots(doc) {
  let moved = 0;
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh(); if (!mesh) continue;
    const T = node.getTranslation(), S = node.getScale();   // quantize() puts the dequantize transform on the node
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute('POSITION'), v = [];
      for (let i = 0; i < pos.getCount(); i++) {
        pos.getElement(i, v);
        const x = v[0] * S[0] + T[0], y = v[1] * S[1] + T[1], z = v[2] * S[2] + T[2];
        for (const [cx, cz, rx, rz, ymax] of BOOTS) {
          if (y >= ymax || ((x - cx) / rx) ** 2 + ((z - cz) / rz) ** 2 >= 1) continue;
          const nx = cx + (x - cx) * .35, ny = ymax + .02, nz = cz - .04 + (z - cz) * .35;
          pos.setElement(i, [(nx - T[0]) / S[0], (ny - T[1]) / S[1], (nz - T[2]) / S[2]]);
          moved++; break;
        }
      }
    }
  }
  return moved;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { NodeIO } = await import('@gltf-transform/core');
  const { ALL_EXTENSIONS } = await import('@gltf-transform/extensions');
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  for (const f of process.argv.slice(2)) { const doc = await io.read(f); const n = tuckBoots(doc); await io.write(f, doc); console.log(f, 'boot vertices tucked', n); }
}
