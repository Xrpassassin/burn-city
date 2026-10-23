// Homefront authority/validation regressions found in the #148 audit.
'use strict';
const assert = require('assert');
const Core = require('../server/homefront-core');
const Inventory = require('../server/homefront-inventory');
const World = require('../server/homefront-world');
const { isClientError } = require('../server/homefront');

// 1. Prototype keys must never resolve as catalog entries (they used to turn embers/resources into NaN).
const base = Core.createBase('rSec1');
for (const key of ['constructor', '__proto__', 'toString', 'valueOf', 'hasOwnProperty']) {
  for (const action of [
    { type: 'buy_cosmetic', skin: key }, { type: 'equip_cosmetic', skin: key }, { type: 'buy_upgrade', upgrade: key },
    { type: 'expedition', zone: 'outskirts', difficulty: key }, { type: 'expedition', zone: key },
    { type: 'build', building: key, x: 1, z: 1 }, { type: 'craft_weapon', weapon: key }, { type: 'craft_mod', mod: key, weapon: 'pipe_blade' },
    { type: 'equip_weapon', weapon: key }, { type: 'buy_materials', resource: key }, { type: 'rescue_survivor', zone: 'outskirts', difficulty: key }
  ]) {
    assert.throws(() => Core.applyAction(base, 'rSec1', action), /^Error: (unknown_|invalid_|weapon_not_owned)/, JSON.stringify(action));
  }
  assert.throws(() => Inventory.add({}, key, 1), /unknown_item/);
  assert.throws(() => Inventory.withdraw({}, base.resources, key, 1), /unknown_item/);
}
assert.ok(Number.isFinite(base.embers));

// 2. Error classification: rule codes are 400s, internal failures stay 500.
for (const code of ['party_full', 'unknown_boss_zone', 'terrain_path_blocked', 'invalid_aim_point', 'big', 'not_in_party']) assert.ok(isClientError(code), code);
for (const msg of ['save_invalid', 'no_safe_spawn_location', "Cannot read properties of undefined (reading 'x')", '']) assert.ok(!isClientError(msg), msg);

// 3. Parties: leave without leaving the expedition; stale/duplicate memberships repaired; max 4; leader hand-off.
let w = World.defaultWorld(); const now = Date.now();
for (const a of ['rP1', 'rP2', 'rP3', 'rP4', 'rP5']) w = World.enter(w, a, now).world;
w = World.createParty(w, 'rP1', now).world;
const code = w.players.rP1.partyCode;
for (const a of ['rP2', 'rP3', 'rP4']) w = World.joinParty(w, a, code.toLowerCase(), now).world;
assert.throws(() => World.joinParty(w, 'rP5', code, now), /party_full/);
assert.throws(() => World.joinParty(w, 'rP2', code, now), /already_in_party/);
assert.throws(() => World.joinParty(w, 'rP5', 'ZZZZZZ', now), /party_not_found/);
assert.throws(() => World.move(w, 'rP2', 0, 0, now + 2000), /party_leader_controls_movement/);
let r = World.leaveParty(w, 'rP2', now); w = r.world;
assert.equal(r.result.party, null, 'member left the party');
assert.ok(r.result.self, 'but is still on the expedition map');
assert.equal(w.players.rP2.partyCode, null);
assert.doesNotThrow(() => World.move(w, 'rP2', w.players.rP2.x + 1, w.players.rP2.z, now + 2000), 'movement control returns after leaving the party');
assert.throws(() => World.leaveParty(w, 'rP2', now), /not_in_party/);
r = World.leaveParty(w, 'rP1', now); w = r.world;
assert.ok(['rP3', 'rP4'].includes(w.parties[code].leader), 'leader leaving hands leadership to a remaining member');
assert.equal(w.parties[code].members.includes('rP1'), false);
// stale partyCode (party gone) and a member listed in two parties are repaired on load
const broken = JSON.parse(JSON.stringify(w));
broken.players.rP5.partyCode = 'DEAD00';
broken.parties.DUP001 = { leader: 'rP3', members: ['rP3'], createdAt: now };
const fixed = World.normalizeWorld(broken);
assert.equal(fixed.players.rP5.partyCode, null, 'stale party code cleared, player can create/join again');
assert.equal(fixed.parties.DUP001, undefined, 'a member listed in a party they are not in is dropped');
assert.ok(fixed.parties[code].members.includes('rP3'));
assert.doesNotThrow(() => World.createParty(fixed, 'rP5', now));

// 4. Movement is clamped to the step budget and the world bounds regardless of what the client sends.
let m = World.defaultWorld(); m = World.enter(m, 'rMove', now).world;
const start = { ...m.players.rMove };
const moved = World.move(m, 'rMove', 1e9, -1e9, now + 2000).world.players.rMove;
assert.ok(Math.hypot(moved.x - start.x, moved.z - start.z) <= World.MOVE_STEP + 0.2, 'one move never exceeds MOVE_STEP');
assert.throws(() => World.move(m, 'rMove', start.x + 1, start.z, now + 100), /move_cooldown/);
const nan = World.move(m, 'rMove', 'abc', null, now + 2000).world.players.rMove;
assert.ok(Number.isFinite(nan.x) && Number.isFinite(nan.z), 'non-numeric targets never produce NaN positions');
assert.throws(() => World.move(m, 'rMove', 0, 0, now + 2000, 'yes'), /invalid_movement_mode/);

// 5. Structures must not overlap server-owned farm plots; placement remains authoritative.
const farmBase = Core.createBase('rBuildCollision', now);
const tilled = Core.applyAction(farmBase, 'rBuildCollision', { type: 'farm_till', x: 4, z: 4 }, now + 1);
assert.equal(tilled.farmPlots.length, 1);
assert.throws(() => Core.applyAction(tilled, 'rBuildCollision', { type: 'build', building: 'garden', x: 4, z: 4 }, now + 2), /placement_occupied/,
  'a structure cannot be placed directly on a farm plot');
assert.throws(() => Core.applyAction(tilled, 'rBuildCollision', { type: 'build', building: 'wall', x: 5, z: 4 }, now + 2), /placement_occupied/,
  'the farm plot keeps a clear physical footprint');
const builtAway = Core.applyAction(tilled, 'rBuildCollision', { type: 'build', building: 'garden', x: 7, z: 7 }, now + 3);
assert.equal(builtAway.structures.length, 1, 'valid non-overlapping construction still succeeds');

console.log('Homefront security/authority regressions passed.');
