import assert from 'node:assert/strict';
import { advanceFlight, beginFlight, dockingStatus } from './flight.mjs';

function tick(state, frames, input) {
  for (let i = 0; i < frames; i++) state = advanceFlight(state, .05, input);
  return state;
}
const launch = beginFlight();
assert.equal(tick(launch, 59).phase, 'launch');
const approach = tick(launch, 61);
assert.equal(approach.phase, 'approach');
assert.equal(advanceFlight(approach, NaN), approach);
const blocked = tick(approach, 200, { approach: true });
assert.equal(blocked.distance, 4);
assert.equal(blocked.phase, 'approach');
const aligned = tick(tick(blocked, 8, { x: 1, y: -1 }), 4, { x: 1 });
assert.match(dockingStatus(aligned), /^Aligned/);
assert.equal(aligned.phase, 'approach');
const docked = advanceFlight(aligned, .05, { approach: true });
assert.equal(docked.phase, 'docked');
assert.equal(advanceFlight(docked, .05, { x: 1 }), docked);
assert.deepEqual(beginFlight(), launch);
console.log('Orbital flight launch, alignment, docking and restart passed');
