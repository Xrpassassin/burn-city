'use strict';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../client/arena/assets/homefront');
for (const name of ['survivor.glb','fence.glb','fence-gate.glb','campfire-stones.glb']) {
  const bytes = fs.readFileSync(path.join(root, name));
  assert.equal(bytes.toString('ascii', 0, 4), 'glTF', name + ' has GLB magic');
  assert.equal(bytes.readUInt32LE(4), 2, name + ' is glTF 2.0');
  assert.equal(bytes.readUInt32LE(8), bytes.length, name + ' declared length matches file');
  const jsonLength = bytes.readUInt32LE(12);
  assert.equal(bytes.readUInt32LE(16), 0x4e4f534a, name + ' begins with JSON chunk');
  const doc = JSON.parse(bytes.toString('utf8', 20, 20 + jsonLength));
  assert.ok(doc.scenes?.length && doc.nodes?.length && doc.meshes?.length, name + ' contains renderable scene geometry');
  if (name === 'survivor.glb') assert.ok(doc.animations?.length, 'survivor model includes animation clips');
}
console.log('Homefront CC0 GLB asset checks passed.');
