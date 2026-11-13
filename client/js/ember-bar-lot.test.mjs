import assert from 'node:assert/strict';
import { emberLot, lotClear, LOT } from './ember-bar-lot.mjs';
const V = (x, z) => ({ x, y: 0, z });
const BURN = { name: 'BURN', pos: V(0, -175), w: 5.7, distR: 45 }, XRP = { name: 'XRP', pos: V(0, 0), w: 11 }, KYC = { name: 'KYC', pos: V(-26.7, -265.7), w: 2.7 };
const city = () => ({ N: { BURN, XRP, KYC }, streets: [{ type: 'ring', c: BURN.pos, r: 27.9 }, { type: 'ring', c: BURN.pos, r: 44.1 }, { type: 'ring', c: XRP.pos, r: 62 }, { type: 'line', a: V(0, -62), b: V(0, -130.9) }], colliders: [] });

// 1) default: straight out from the hub, behind BURN, past the ring road + sidewalk, front facing the tower
{ const L = emberLot(city()); assert.ok(L);
  assert.ok(Math.abs(L.x) < 1e-9 && L.z < -175 - 44.1 - LOT.ROAD_HW - LOT.D / 2, 'outside the outer ring road');
  const fx = Math.sin(L.yaw), fz = Math.cos(L.yaw); assert.ok(fz > .99 && Math.abs(fx) < 1e-9, 'front door faces BURN'); }
// 2) something on the first lot -> steps around the ring, still clear
{ const c = city(); const first = emberLot(c); c.colliders.push({ x: first.x, z: first.z, r: 3, h: 10 });
  const L = emberLot(c); assert.ok(L && Math.hypot(L.x - first.x, L.z - first.z) > 8, 'moved off the blocked lot');
  assert.ok(lotClear({ ...c, nodes: [XRP, KYC] }, L.x, L.z, L.yaw, BURN.pos)); assert.ok(Math.abs(Math.hypot(L.x, L.z + 175) - Math.hypot(first.x, first.z + 175)) < 1e-6, 'same setback from the ring'); }
// 3) a lamp post in the doorway also blocks; small things count
{ const c = city(); const first = emberLot(c); c.colliders.push({ x: first.x, z: first.z + LOT.D / 2 + 2, r: .4, h: 6 });
  assert.notDeepEqual(emberLot(c), first); }
// 4) live data: a wider BURN district moves the lot out with the ring
{ const c = city(); c.streets[1].r = 52; const L = emberLot(c); assert.ok(L.z < -175 - 52 - LOT.ROAD_HW); }
// 5) everything blocked -> null (the building is simply not placed)
{ const c = city(); for (let a = 0; a < 360; a += 3) { const r = 44.1 + LOT.ROAD_HW + LOT.GAP + LOT.D / 2; c.colliders.push({ x: Math.cos(a * Math.PI / 180) * r, z: -175 + Math.sin(a * Math.PI / 180) * r, r: 2, h: 5 }); }
  assert.equal(emberLot(c), null); }
// 6) avoid zones (e.g. the CB1 pad) are honoured
{ const c = city(); const first = emberLot(c); assert.equal(lotClear({ ...c, nodes: [] }, first.x, first.z, first.yaw, BURN.pos, [{ x: first.x, z: first.z, r: 5 }]), false); }
console.log('ember-bar-lot ok');
