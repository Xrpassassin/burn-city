import assert from 'node:assert/strict';
import { updateBoatBehavior, BOAT_AI_THRESHOLDS } from './boat-ai.js';

const boat = (kind, x = 0, z = 0) => ({
  kind,
  aiState: 'patrol',
  speed: 4,
  group: { position: { x, z } }
});

const patrol = boat('patrol');
assert.equal(updateBoatBehavior(patrol, { x: 100, z: 0 }, 1).mode, 'route');
assert.equal(updateBoatBehavior(patrol, { x: 50, z: 0 }, 0.016).state, 'alert');
patrol.group.position.x = 20;
assert.equal(updateBoatBehavior(patrol, { x: 0, z: 0 }, 0.016).state, 'engage');
const engage = updateBoatBehavior(patrol, { x: 0, z: 0 }, 0.016);
assert.equal(engage.mode, 'engage');
assert.ok(Math.abs(Math.hypot(engage.moveX, engage.moveZ) - 1) < 1e-9);
patrol.group.position.x = 70;
assert.equal(updateBoatBehavior(patrol, { x: 0, z: 0 }, 0.016).state, 'patrol');

const merchant = boat('merchant', 10, 0);
const flee = updateBoatBehavior(merchant, { x: 0, z: 0 }, 0.016);
assert.equal(flee.mode, 'evade');
assert.ok(flee.moveX > 0, 'merchant should move away from the player');
merchant.group.position.x = 50;
assert.equal(updateBoatBehavior(merchant, { x: 0, z: 0 }, 0.016).state, 'patrol');

const invalid = updateBoatBehavior(boat('patrol', NaN, 0), { x: 0, z: 0 }, 0.016);
assert.equal(invalid.mode, 'route');
assert.ok(BOAT_AI_THRESHOLDS.patrolNotice < BOAT_AI_THRESHOLDS.patrolDisengage);
console.log('Blacktide boat AI tests passed');
