'use strict';
const assert = require('node:assert/strict');
const S = require('./homefront-survival');
const start = 100000;
const fresh = S.normalize(null, start);
assert.deepEqual([fresh.health, fresh.hunger, fresh.thirst, fresh.stamina, fresh.infection], [100, 100, 100, 100, 0]);
const decayed = S.tick(fresh, start + 10000);
assert.ok(decayed.hunger < fresh.hunger && decayed.thirst < fresh.thirst, 'hunger and thirst decay during an active expedition');
const moved = S.move(fresh, start + 1000);
assert.equal(moved.stamina, 95, 'a full-distance move consumes five stamina');
const shortMove = S.move(fresh, start + 1000, 4);
assert.equal(shortMove.stamina, 97, 'short movement costs less stamina than a full-distance move');
assert.ok(shortMove.hunger < fresh.hunger && shortMove.thirst < fresh.thirst, 'travel increases food and water needs');
const depletedMove = S.move({ ...fresh, hunger: 20 }, start + 1000, 12);
assert.equal(depletedMove.stamina, 92.5, 'moving while hungry increases exertion cost');
// Continuous movement must never pay the legacy 2-point overhead on every packet.
const continuousOne = S.moveContinuous(fresh, start + 1000, 1);
assert.ok(continuousOne.stamina > 99.5 && continuousOne.stamina < 99.6,
  'one world unit of continuous travel has a fractional stamina cost');
const continuousFull = S.moveContinuous(fresh, start + 1000, 12);
assert.equal(continuousFull.stamina, moved.stamina,
  'twelve total world units cost the same as a full legacy travel step');
let smallPackets = fresh;
for (let i = 1; i <= 12; i++) smallPackets = S.moveContinuous(smallPackets, start + i * 125, 1);
assert.ok(Math.abs(smallPackets.stamina - continuousFull.stamina) < 1e-8,
  'packet count does not change continuous movement stamina consumption');
const hungryContinuous = S.moveContinuous({ ...fresh, hunger: 20 }, start + 1000, 12);
assert.equal(hungryContinuous.stamina, depletedMove.stamina,
  'hunger penalty remains equivalent at equal distance');
const noMotion = S.moveContinuous(fresh, start + 1000, 0);
assert.equal(noMotion.stamina, fresh.stamina, 'neutral input never costs travel stamina');
assert.ok(continuousFull.hunger < fresh.hunger && continuousFull.thirst < fresh.thirst,
  'continuous travel preserves food and water consumption');

const ate = S.act({ ...fresh, hunger: 40 }, 'eat', start + 1000);
assert.ok(ate.hunger > 77.9 && ate.hunger < 78, 'eating restores hunger after normal elapsed-time decay');
const drank = S.act({ ...fresh, thirst: 30 }, 'drink', start + 1000);
assert.ok(drank.thirst > 74.9 && drank.thirst < 75, 'drinking restores thirst after normal elapsed-time decay');
const bandaged = S.act({ ...fresh, health: 50, infection: 10 }, 'bandage', start + 1000);
assert.equal(bandaged.health, 80, 'bandage restores health');
assert.equal(bandaged.infection, 2, 'bandage reduces infection pressure');
const rested = S.act({ ...fresh, stamina: 20 }, 'catch_breath', start + 1000);
assert.equal(rested.stamina, 65, 'rest restores stamina');
assert.throws(() => S.act(fresh, 'eat', start + 1000), /not_hungry/);
assert.throws(() => S.act(fresh, 'drink', start + 1000), /not_thirsty/);
assert.throws(() => S.act(fresh, 'bandage', start + 1000), /not_injured/);
assert.throws(() => S.act(fresh, 'bad_action', start + 1000), /unknown_survival_action/);
const starving = S.tick({ ...fresh, hunger: 0, thirst: 100, health: 50, lastTick: start }, start + 10000);
assert.ok(starving.health < 50, 'health is pressured when needs are critically depleted');
console.log('Homefront field survival rules passed.');
