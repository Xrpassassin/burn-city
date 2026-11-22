// Hover mage LODs from the Sketchfab "Dark Hooded Robe" (maksfrolov947, CC BY 4.0).
// Box-only tool, not in CI: run from a folder with @gltf-transform/{core,extensions,functions}@4, meshoptimizer and sharp installed:
//   node scripts/hover-mage/build.mjs <staged scene.gltf> <out dir>   then copy the two GLBs to client/assets/players/hover-mage/.
// The source normal map is flat (stdev ~3/255 at 4K), so it is dropped; base colour only.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { weld, dedup, prune, simplify, quantize, flatten, join, textureCompress, normals } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
import fs from 'fs';
const SRC = process.argv[2] || '/workspace/work/robe/scene.gltf', OUT = process.argv[3] || '/workspace/work/robe/out';
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const tris = d => d.getRoot().listMeshes().reduce((n, m) => n + m.listPrimitives().reduce((a, p) => a + (p.getIndices()?.getCount() ?? p.getAttribute('POSITION').getCount()) / 3, 0), 0);
for (const [name, target, size, keepNormalMap] of [['hover-mage', 15000, 1024, false], ['hover-mage-lod', 5000, 512, false]]) {
  const doc = await io.read(SRC);
  for (const p of doc.getRoot().listMeshes().flatMap(m => m.listPrimitives())) {
    for (const sem of p.listSemantics()) if (!['POSITION', 'NORMAL', 'TEXCOORD_0'].includes(sem)) { const a = p.getAttribute(sem); p.setAttribute(sem, null); if (!a.listParents().some(x => x !== doc.getRoot())) a.dispose(); }
  }
  await doc.transform(flatten(), join({ keepNamed: false }), weld(), dedup(), prune());
  const before = tris(doc);
  // Two passes: one 450k -> 5k pass loses the thin hood rim.
  for (const t of [Math.max(target, 40000), target]) {
    const r = Math.min(1, t / tris(doc));
    await doc.transform(simplify({ simplifier: MeshoptSimplifier, ratio: r, error: 0.02, lockBorder: false }));
  }
  const mat = doc.getRoot().listMaterials()[0];
  if (!keepNormalMap) { const nt = mat.getNormalTexture(); mat.setNormalTexture(null); nt?.dispose(); }
  mat.setRoughnessFactor(0.85).setMetallicFactor(0).setDoubleSided(true);
  await doc.transform(prune(), textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [size, size], quality: 80 }), quantize());
  const n = tris(doc);
  const pth = `${OUT}/${name}.glb`;
  await io.write(pth, doc);
  const bb = doc.getRoot().listMeshes()[0].listPrimitives()[0].getAttribute('POSITION');
  console.log(name, 'source tris', before, '-> tris', n, 'bytes', fs.statSync(pth).size, 'textures', doc.getRoot().listTextures().map(t => t.getMimeType() + ' ' + t.getSize() + ' ' + t.getImage().byteLength));
}
