import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../assets/players');
const names = { Idle:1, Walk:1, Run:1, Ride:1, Sit:1, Jump:1 };

function load(file) {
  return JSON.parse(readFileSync(join(root, file), 'utf8'));
}
function tris(g) {
  const acc = g.accessors || [];
  let n = 0;
  for (const m of g.meshes || []) for (const p of m.primitives || []) if (p.indices != null) n += Math.floor(acc[p.indices].count / 3);
  return n;
}
function clips(g) {
  return (g.animations || []).map(a => a.name);
}

const near = load('gas-mask-guy.gltf');
const lod = load('gas-mask-guy-lod.gltf');
const body = load('gas-mask-guy-body.gltf');
assert.equal(tris(near), 9000, 'close-up player is 9,000 triangles');
assert(tris(lod) <= 4000 && tris(lod) >= 2000, 'distant LOD is 2-4k (seam-preserving simplification stops near 3.8k), got ' + tris(lod));
assert(tris(body) < 9000 && tris(body) > 4000, 'first-person body is a headless subset, got ' + tris(body));
for (const g of [near, lod, body]) {
  const have = clips(g);
  assert.deepEqual(new Set(have), new Set(Object.keys(names)), fileClips(g, have));
  assert.equal(g.skins?.length, 1);
}
function fileClips(g, have) { return 'clips ' + have.join(','); }
console.log('Default player avatar assets: 9000 /', tris(lod), '/', tris(body), 'triangles with Idle, Walk, Run, Ride, Sit and Jump');
