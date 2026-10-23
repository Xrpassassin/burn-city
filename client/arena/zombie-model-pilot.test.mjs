import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const asset = new URL('./assets/zombies/zombie-ash.glb', import.meta.url);
const bytes = readFileSync(fileURLToPath(asset));
assert.equal(bytes.toString('ascii', 0, 4), 'glTF', 'asset must be a binary glTF (GLB)');
assert.equal(bytes.readUInt32LE(4), 2, 'GLB container version must be 2');
assert.equal(bytes.readUInt32LE(8), bytes.length, 'declared GLB length must match the bundled file');
assert.equal(bytes.readUInt32LE(12) % 4, 0, 'JSON chunk length must be aligned');

const jsonLength = bytes.readUInt32LE(12);
const doc = JSON.parse(bytes.toString('utf8', 20, 20 + jsonLength));
assert.equal(doc.asset?.version, '2.0');
assert.ok(doc.skins?.length, 'zombie should have a skinned rig');
assert.ok(doc.materials?.length, 'zombie should have a material');
for (const name of ['Idle', 'Walk', 'Idle_Attack', 'HitReact', 'Death']) {
  assert.ok(doc.animations?.some(a => a.name === name), `required animation missing: ${name}`);
}
console.log('zombie model asset checks passed');
