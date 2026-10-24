// Gun platform geometry: server/client parity, stair walking, railings, line of sight, placement.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import * as C from '../client/arena/homefront-platforms.mjs';
const require = createRequire(import.meta.url);
const S = require('../server/homefront-platforms.js');
const Core = require('../server/homefront-core.js');

const plats = [
  { id: 'b1', type: 'gun_platform', hp: 200, x: 5, z: -5, rotation: 0 },
  { id: 'b2', type: 'gun_platform', hp: 200, x: -5, z: 4, rotation: Math.PI / 2 },
  { id: 'b3', type: 'gun_platform', hp: 0, x: 0, z: 7, rotation: 0 },          // destroyed: no floor
  { id: 'w1', type: 'wall', hp: 100, x: 0, z: -9, rotation: 0 }
];
// 1. Server and client mirror agree everywhere.
let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
for (let i = 0; i < 4000; i++) {
  const x = rnd() * 20 - 10, z = rnd() * 20 - 10, x2 = x + rnd() * 2 - 1, z2 = z + rnd() * 2 - 1;
  assert.equal(C.heightAt(plats, x, z), S.heightAt(plats, x, z));
  assert.equal(C.canStep(plats, x, z, x2, z2), S.canStep(plats, x, z, x2, z2));
  const from = { x, y: rnd() * 5, z }, to = { x: x2 * 5, y: 1, z: z2 * 5 };
  assert.equal(C.lineOfSight(plats, from, to), S.lineOfSight(plats, from, to));
}
for (const k of ['DECK_HEIGHT', 'DECK_HALF', 'STAIR_HALF_WIDTH', 'STAIR_LENGTH', 'MAX_STEP', 'EYE', 'YARD_HALF', 'PLATFORM_GAP']) assert.equal(C[k], S[k], k);
assert.deepEqual({ ...C.BLOCK_HEIGHT }, { ...S.BLOCK_HEIGHT });

// 2. Walking up the stairs reaches the deck; walking back down returns to the ground.
const p = plats[0];
const path = S.stairPath(p);
assert.equal(path[0].y, 0, 'stair foot is on the ground');
assert.equal(path.at(-1).y, S.DECK_HEIGHT, 'path ends on the deck');
let pos = { x: path[0].x, z: path[0].z };
for (let i = 0; i < 60; i++) { const nz = pos.z - 0.1; assert.ok(S.canStep(plats, pos.x, pos.z, pos.x, nz), 'every stair step is walkable at ' + nz.toFixed(2)); pos.z = nz; if (pos.z <= p.z) break; }
assert.equal(S.heightAt(plats, pos.x, pos.z), S.DECK_HEIGHT, 'walked onto the deck');
for (let i = 0; i < 60 && pos.z < path[0].z; i++) { assert.ok(S.canStep(plats, pos.x, pos.z, pos.x, pos.z + 0.1)); pos.z += 0.1; }
assert.equal(S.heightAt(plats, pos.x, pos.z), 0, 'walked back down to the ground');
// 3. Railings: you cannot step off the deck sides or back, nor climb onto it from the side.
assert.equal(S.canStep(plats, p.x, p.z, p.x + 1.5, p.z), false, 'deck side is a railing');
assert.equal(S.canStep(plats, p.x, p.z, p.x, p.z - 1.5), false, 'deck back is a railing');
assert.equal(S.canStep(plats, p.x + 2, p.z, p.x, p.z), false, 'cannot climb onto the deck from the side');
assert.equal(S.canStep(plats, p.x + 1.2, p.z + 2.0, p.x, p.z + 2.0), false, 'cannot step sideways onto the upper stairs');
// Rotated platform: stairs follow the rotation (local +z).
const rp = plats[1], rpath = S.stairPath(rp);
assert.ok(Math.abs(rpath[0].x - (rp.x + S.DECK_HALF + S.STAIR_LENGTH + 0.3)) < 1e-9 && Math.abs(rpath[0].z - rp.z) < 1e-9, 'rotated stairs run along +x');
assert.equal(S.heightAt(plats, 0, 7), 0, 'destroyed platforms have no deck');
// 4. Line of sight: a ground shooter behind a wall is blocked; the platform eye sees over it.
const target = { x: 0, y: 1, z: -25 };
assert.equal(S.lineOfSight(plats, { x: 0, y: S.EYE, z: -7.5 }, target), false, 'wall blocks a ground shooter');
assert.equal(S.lineOfSight(plats, { x: 0, y: S.DECK_HEIGHT + S.EYE, z: -7.5 }, target), true, 'platform eye clears the wall');
// 5. Placement: platforms need more room and their stair foot must stay inside the yard.
assert.equal(S.structureGap('gun_platform', 'wall'), S.PLATFORM_GAP);
assert.equal(S.structureGap('wall', 'wall'), 1.65);
assert.equal(S.footprintInBounds('gun_platform', 0, 9, 0), false, 'stairs would leave the yard');
assert.equal(S.footprintInBounds('gun_platform', 0, 9, Math.PI), true, 'turned around, the stairs point inward');
let base = Core.createBase('plat-test', 1); base.resources.wood = 999; base.resources.scrap = 999; base.resources.steel = 99;
base = Core.applyAction(base, 'plat-test', { type: 'build', building: 'gun_platform', x: 5, z: -5, rotation: 0 }, 2);
assert.throws(() => Core.applyAction(base, 'plat-test', { type: 'build', building: 'wall', x: 6.5, z: -5 }, 3), /placement_occupied/, 'walls keep clear of the platform');
assert.throws(() => Core.applyAction(base, 'plat-test', { type: 'build', building: 'gun_platform', x: 0, z: 9 }, 3), /placement_out_of_bounds/);
assert.throws(() => Core.applyAction(base, 'plat-test', { type: 'build', building: 'mortar_pit', x: -5, z: -5 }, 3), /structure_requires_refuge_level_5/, 'mortar pit needs refuge level 5');
const lvl5 = Core.applyAction({ ...base, level: 5 }, 'plat-test', { type: 'build', building: 'mortar_pit', x: -5, z: -5 }, 4);
assert.ok(lvl5.structures.some(s => s.type === 'mortar_pit'));
// Old saves without the new structure types still validate unchanged.
const old = Core.createBase('old-save', 1); delete old.lastSiege;
assert.ok(Core.validateBase(old, 'old-save'));
console.log('Homefront platform geometry tests passed.');
