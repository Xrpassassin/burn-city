import test from 'node:test';
import assert from 'node:assert/strict';
import { assignment, fitLot, pickLots, streetYaw, budget, infillOwner, ASSIGN, MODELS } from './citybuildings2-core.mjs';

test('frozen mapping: every model used once, each district only gets its own', () => {
  assert.deepEqual(assignment(['BURN', 'IMM', 'XRPyro', 'IMG', 'DRGN', 'RACC', 'XRP', '666']),
    { BURN: ['b7'], IMM: ['b10'], XRPyro: ['b11'], IMG: ['b4'], DRGN: ['b6'], RACC: ['b1', 'b5'] });
  assert.deepEqual(assignment(['BURN', '666']), { BURN: ['b7'] });
  const all = Object.values(ASSIGN).flat(); assert.equal(new Set(all).size, all.length); assert.equal(all.length, 7); for (const m of all) assert.ok(MODELS[m]);
});
test('a mixed district takes the model that fits each lot best', () => {
  const n = { name: 'RACC' }, dims = { slim: { rXZ: 10, H: 100 }, wide: { rXZ: 40, H: 100 } };
  const sats = [{ x: 0, z: 0, w: 1.5, top: 14, n }, { x: 30, z: 0, w: 4, top: 9, n }];
  const r = pickLots(sats, { RACC: ['slim', 'wide'] }, m => dims[m], [], { perDistrict: 9, minH: 5 });
  assert.deepEqual(r.lots.map(l => l.model), ['slim', 'wide']);
});
test('fit stays inside the lot collider and keeps height close to the procedural tower', () => {
  const dims = { rXZ: 60, H: 300 };
  const f = fitLot({ w: 3, top: 14 }, dims); assert.ok(f); assert.ok(f.r <= 3 * 1.02); assert.ok(f.h <= 14 + 1e-9 && f.h >= 14 * .5);
  assert.equal(fitLot({ w: 3, top: 3 }, dims), null);               // too small a lot for a tower
  assert.equal(fitLot({ w: 1.2, top: 40 }, dims), null);            // too thin a lot for that silhouette
});
test('picks only district fillers, caps per district, honours keep-outs', () => {
  const n = { name: 'BURN' }, o = { name: 'XRP' }, dims = () => ({ rXZ: 30, H: 120 });
  const sats = [{ x: 0, z: 0, w: 3, top: 12, n }, { x: 10, z: 0, w: 3, top: 12, n, holder: {} }, { x: 20, z: 0, w: 3, top: 12, n: null, infill: 1 },
    { x: 30, z: 0, w: 3, top: 12, n: o }, { x: 40, z: 0, w: 3, top: 12, n }, { x: 50, z: 0, w: 3, top: 12, n }];
  const B = { perDistrict: 2, minH: 5 };
  const r = pickLots(sats, { BURN: 'b7' }, dims, [], B, [{ x: 50, z: 0, r: 4 }]);
  assert.deepEqual(r.lots.map(l => l.x), [0, 40]); assert.equal(r.skipped.BURN, 1);
});
test('faces the nearest street', () => {
  const streets = [{ type: 'line', a: { x: -50, z: 10 }, b: { x: 50, z: 10 } }];
  assert.ok(Math.abs(streetYaw(0, 0, streets) - 0) < 1e-9);          // street at +z -> yaw 0 (model +Z faces it)
  const ring = [{ type: 'ring', c: { x: 0, z: 0 }, r: 20 }];
  assert.ok(Math.abs(streetYaw(30, 0, ring) + Math.PI / 2) < 1e-9);  // ring inside -> face -x
  assert.ok(budget('low').perDistrict < budget('high').perDistrict);
});
test('infill joins a district only when it clearly sits just outside that one district', () => {
  const hubs = [{ name: 'BURN', x: 0, z: 0, R: 40 }, { name: 'IMM', x: 200, z: 0, R: 40 }];
  assert.equal(infillOwner(60, 0, hubs), 'BURN');
  assert.equal(infillOwner(100, 0, hubs), null);       // halfway between: ambiguous
  assert.equal(infillOwner(0, 120, hubs), null);       // too far out
  const n = { name: 'BURN' }, sats = [{ x: 60, z: 0, w: 3, top: 12, n: null, infill: 1 }, { x: 0, z: 0, w: 3, top: 12, n }];
  const r = pickLots(sats, { BURN: 'b7' }, () => ({ rXZ: 30, H: 120 }), [], { perDistrict: 1, minH: 5 }, [], s => infillOwner(s.x, s.z, hubs));
  assert.deepEqual(r.lots.map(l => l.x), [0]);          // filler first under the cap
});
