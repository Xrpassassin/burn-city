import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const variants = ['zombie-ash.glb', 'zombie-frost.glb', 'zombie-rust.glb', 'quaternius-zombie.glb'];
for (const filename of variants) {
  const asset = new URL(`./assets/zombies/${filename}`, import.meta.url);
  const bytes = readFileSync(fileURLToPath(asset));
  assert.equal(bytes.toString('ascii', 0, 4), 'glTF', `${filename}: must be a binary glTF (GLB)`);
  assert.equal(bytes.readUInt32LE(4), 2, `${filename}: GLB container version must be 2`);
  assert.equal(bytes.readUInt32LE(8), bytes.length, `${filename}: declared length must match the file`);
  assert.equal(bytes.readUInt32LE(12) % 4, 0, `${filename}: JSON chunk must be aligned`);
  const jsonLength = bytes.readUInt32LE(12);
  const doc = JSON.parse(bytes.toString('utf8', 20, 20 + jsonLength));
  assert.equal(doc.asset?.version, '2.0', `${filename}: glTF version`);
  assert.ok(doc.skins?.length, `${filename}: skinned rig required`);
  assert.ok(doc.materials?.length, `${filename}: material required`);
  for (const name of ['Idle', 'Walk', 'Idle_Attack', 'HitReact', 'Death']) {
    assert.ok(doc.animations?.some(a => a.name === name), `${filename}: required animation missing: ${name}`);
  }
}
console.log('zombie model variant asset checks passed');
