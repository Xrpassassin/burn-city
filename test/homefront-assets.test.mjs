'use strict';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../client/arena/assets/homefront');
for (const name of ['survivor.glb','zombie.glb','fence.glb','fence-gate.glb','campfire-stones.glb']) {
  const bytes = fs.readFileSync(path.join(root, name));
  assert.equal(bytes.toString('ascii', 0, 4), 'glTF', name + ' has GLB magic');
  assert.equal(bytes.readUInt32LE(4), 2, name + ' is glTF 2.0');
  assert.equal(bytes.readUInt32LE(8), bytes.length, name + ' declared length matches file');
  const jsonLength = bytes.readUInt32LE(12);
  assert.equal(bytes.readUInt32LE(16), 0x4e4f534a, name + ' begins with JSON chunk');
  const doc = JSON.parse(bytes.toString('utf8', 20, 20 + jsonLength));
  assert.ok(doc.scenes?.length && doc.nodes?.length && doc.meshes?.length, name + ' contains renderable scene geometry');
  if (name === 'survivor.glb' || name === 'zombie.glb') assert.ok(doc.animations?.length, name + ' includes animation clips');
}
const html = fs.readFileSync(path.join(root, '../../homefront.html'), 'utf8');
assert.ok(html.includes("'../vendor/three/examples/jsm/loaders/GLTFLoader.js'"), 'Homefront GLTFLoader import resolves to the shared vendored Three.js addons');
assert.ok(html.includes("'../vendor/three/examples/jsm/utils/SkeletonUtils.js'"), 'Homefront SkeletonUtils import resolves to the shared vendored Three.js addons');
assert.ok(html.includes("['cookFieldFood',canAct&&usableFoodCount(inv,'rawFood')>0&&(inv.wood||0)>0]"), 'cooking requires usable raw food and wood');
assert.ok(html.includes("['purifyFieldWater',canAct&&(inv.dirtyWater||0)>0&&(inv.wood||0)>0]"), 'water purification is disabled until an expedition has dirty water and wood');
assert.ok(html.includes("const v=expeditionWorld?.selfSurvival,inv=expeditionWorld?.selfInventory||expeditionWorld?.inventory||{},deployed=!!expeditionWorld?.self"), 'survival UI derives contextual actions from server-returned expedition state');
assert.ok(html.includes('function foodFreshness(inv,id,now=Date.now())'), 'field and refuge inventory calculate food freshness from batch timestamps');
assert.ok(html.includes("q.textContent='Fresh '+f.fresh+' · Aging '+f.aging+' · Spoiled '+f.spoiled"), 'refuge stores visibly summarize freshness states');
for (const rel of ['../vendor/three/examples/jsm/loaders/GLTFLoader.js', '../vendor/three/examples/jsm/utils/SkeletonUtils.js']) {
  assert.ok(fs.existsSync(path.resolve(root, rel.replace('../vendor/', '../../../vendor/'))), 'module exists: ' + rel);
}
console.log('Homefront CC0 GLB asset checks passed.');
