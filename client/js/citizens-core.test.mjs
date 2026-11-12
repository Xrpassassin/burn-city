import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { validateCitizen, activeEntry, resolvePlace, pickNear, minutesOf, placeOk, budgetFor } from './citizens-core.mjs';
const root = new URL('../', import.meta.url);
const models = JSON.parse(readFileSync(new URL('assets/citizens/models.json', root)));
const ids = models.models.map(m => m.id);
assert.ok(ids.length >= 10, 'the 10 approved walker models are published');
for (const m of models.models) {
  assert.equal(m.license, 'CC-BY-4.0', m.id + ' must be CC BY 4.0');
  assert.match(m.url, /^https:\/\/sketchfab\.com\/3d-models\//); assert.ok(m.artist && m.title);
  readFileSync(new URL('assets/citizens/' + m.id + '.far.webp', root));
  const gltf = JSON.parse(readFileSync(new URL('assets/citizens/' + m.id + '.gltf', root)));
  for (const im of gltf.images || []) { readFileSync(new URL('assets/citizens/' + im.uri, root)); readFileSync(new URL('assets/citizens/' + im.uri.replace('-tex/', '-tex-512/'), root)); }
  assert.deepEqual((gltf.animations || []).map(a => a.name).sort(), ['Idle', 'Walk'], m.id + ' has Walk + Idle');
  const far = JSON.parse(readFileSync(new URL('assets/citizens/' + m.id + '.far.json', root)));
  const packed = readFileSync(new URL('assets/citizens/' + m.id + '.far.bin', root));
  assert.equal(far.nrmOffset, far.posOffset + far.verts * far.frames * 6, m.id);
  assert.equal(packed.length, far.nrmOffset + far.verts * far.frames * 3, m.id);
  assert.equal(far.idleFrame, far.walkFrames, m.id);
  assert.ok(far.strideMetersPerCycle > 0, m.id);
  const buffers = gltf.buffers.map(({ uri, byteLength }) => {
    const buffer = readFileSync(new URL('assets/citizens/' + uri, root));
    assert.equal(buffer.length, byteLength, m.id);
    return buffer;
  });
  const walk = gltf.animations.find(a => a.name === 'Walk');
  for (const { input } of walk.samplers) {
    const time = gltf.accessors[input];
    const view = gltf.bufferViews[time.bufferView];
    const offset = (view.byteOffset || 0) + (time.byteOffset || 0) + (time.count - 1) * 4;
    assert.ok(Math.abs(buffers[view.buffer].readFloatLE(offset) - far.walkCycleSec) < 1e-6, m.id);
  }
  assert.ok(far.tris <= 2000, m.id + ' far LOD <= 2k tris'); assert.ok(far.nearTris <= 10000, m.id + ' near LOD <= 10k tris');
}
// excluded non-commercial items never appear
const all = JSON.stringify(models);
for (const banned of ['pJOHL', 'pPXzp', 'Contemplative', 'ANIMAL PACK', 'skibidi']) assert.ok(!all.includes(banned), banned);
// credits page lists every published model
const credits = readFileSync(new URL('city-credits.html', root), 'utf8');
for (const m of models.models) assert.ok(credits.includes(m.url) && credits.includes(m.artist), 'credits list ' + m.id);
// every shipped life script validates
const idx = JSON.parse(readFileSync(new URL('data/citizens/index.json', root)));
assert.ok(idx.citizens.length >= 4);
for (const id of idx.citizens) {
  const c = JSON.parse(readFileSync(new URL(`data/citizens/${id}.json`, root)));
  assert.deepEqual(validateCitizen(c, ids), [], id); assert.equal(c.id, id);
}
assert.deepEqual(validateCitizen({ schema: 'x' }).length > 3, true);
assert.equal(minutesOf('07:30'), 450); assert.ok(Number.isNaN(minutesOf('7:30'))); assert.ok(Number.isNaN(minutesOf('24:00')));
assert.ok(placeOk('shop:coffee') && placeOk('tower:BURN') && placeOk('police') && !placeOk('forest') && !placeOk('shop:bank') && !placeOk('police:x'));
const sch = [{ time: '08:00', place: 'shop:coffee' }, { time: '12:00', place: 'police' }, { time: '20:00', place: 'spawn' }];
assert.equal(activeEntry(sch, 7 * 60).place, 'spawn'); assert.equal(activeEntry(sch, 8 * 60).place, 'shop:coffee'); assert.equal(activeEntry(sch, 13 * 60).place, 'police');
const w = { spawn: { x: 0, z: 52 }, police: { door: { x: 5, z: 6 } }, shops: [{ id: 'coffee', door: { x: 10, z: 10 }, yaw: 0 }], towers: [{ name: 'BURN', pos: { x: 100, z: 52 } }], colliders: [{ x: 100, z: 52, r: 12 }] };
assert.deepEqual(resolvePlace('police', w), { x: 5, z: 6 }); assert.deepEqual(resolvePlace('shop:coffee', w), { x: 10, z: 7.8 });
assert.deepEqual(resolvePlace('tower:burn', w), { x: 85, z: 52 }); assert.equal(resolvePlace('fire', w), null); assert.equal(resolvePlace('tower:NOPE', w), null);
const ag = [{ x: 0, z: 0 }, { x: 5, z: 0 }, { x: 1, z: 0, hidden: true }, { x: 9, z: 0, named: true }, { x: 50, z: 0 }];
assert.deepEqual(pickNear(ag, 0, 0, 2, 20), [3, 0]); assert.deepEqual(pickNear(ag, 0, 0, 9, 20), [3, 0, 1]);
assert.ok(budgetFor('medium', true).near <= 8 && budgetFor('high', false).near <= 24 && budgetFor('low', true).near <= 6);
console.log('citizens-core ok:', ids.length, 'models,', idx.citizens.length, 'life scripts');
