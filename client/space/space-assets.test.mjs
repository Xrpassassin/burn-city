import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../assets/space');
const flags = JSON.parse(readFileSync(join(root, 'models.json'), 'utf8'));
assert.equal(flags.cb1, true);
assert.equal(flags.iss, true);

function load(file) {
  return JSON.parse(readFileSync(join(root, file), 'utf8'));
}
function tris(g) {
  const acc = g.accessors || [];
  let n = 0;
  for (const m of g.meshes || []) for (const p of m.primitives || []) if (p.indices != null) n += Math.floor(acc[p.indices].count / 3);
  return n;
}
function assertTextures(g, folder) {
  const images = g.images || [];
  assert.ok(images.length > 0, folder + ' has images');
  for (const image of images) {
    assert.match(image.uri, new RegExp('^' + folder + '/.+\\.webp$'), image.uri);
    assert.ok(existsSync(join(root, image.uri)), image.uri);
    const phone = image.uri.replace('-tex/', '-tex-512/');
    assert.ok(existsSync(join(root, phone)), phone);
  }
  for (const buffer of g.buffers || []) assert.ok(existsSync(join(root, buffer.uri)), buffer.uri);
}

const cb1 = load('cb1.gltf');
const cb1Lod = load('cb1-lod.gltf');
const iss = load('iss.gltf');
const issLod = load('iss-lod.gltf');
assert.ok(tris(cb1) <= 8000 && tris(cb1) >= 6000, 'CB1 close-up should be within the phone budget, got ' + tris(cb1));
assert.ok(tris(cb1Lod) <= 3000 && tris(cb1Lod) >= 2000, 'CB1 LOD should be 2-3k, got ' + tris(cb1Lod));
assert.ok(tris(iss) <= 10000 && tris(iss) >= 7000, 'ISS close-up should be within the phone budget, got ' + tris(iss));
assert.ok(tris(issLod) <= 3500 && tris(issLod) >= 2000, 'ISS LOD should be 2-3.5k, got ' + tris(issLod));
assertTextures(cb1, 'cb1-tex');
assertTextures(cb1Lod, 'cb1-tex');
assertTextures(iss, 'iss-tex');
assertTextures(issLod, 'iss-tex');
console.log('Spaceflight assets:', tris(cb1), '/', tris(cb1Lod), 'CB1 and', tris(iss), '/', tris(issLod), 'ISS triangles, with 1024 and 512 WebP textures');
