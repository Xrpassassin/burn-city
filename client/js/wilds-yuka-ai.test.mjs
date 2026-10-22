import assert from 'node:assert/strict';
import { createWildsWanderAgent, updateWildsWanderAgent, disposeWildsWanderAgent } from './wilds-yuka-ai.mjs';

const agent = createWildsWanderAgent({ x: 2, z: 3, yaw: 0.5, maxSpeed: 2.2 });
assert.ok(agent, 'valid creature inputs create a Yuka agent');
assert.equal(agent.manager.entities.length, 1);
const heading = updateWildsWanderAgent(agent, 1 / 60, 2, 3, 0.5, 2.2);
assert.ok(heading && Number.isFinite(heading.x) && Number.isFinite(heading.z), 'Yuka produces a finite roaming heading');
assert.ok(Math.abs(Math.hypot(heading.x, heading.z) - 1) < 1e-6, 'heading is normalized');
assert.equal(updateWildsWanderAgent(agent, NaN, 2, 3, 0.5), null, 'invalid state is rejected');
assert.equal(createWildsWanderAgent({ x: Infinity }), null, 'invalid spawn is rejected');
assert.equal(disposeWildsWanderAgent(agent), true);
assert.equal(disposeWildsWanderAgent(agent), false, 'dispose is idempotent');
assert.equal(updateWildsWanderAgent(agent, 1 / 60, 2, 3, 0.5), null, 'disposed agent cannot update');
console.log('wilds-yuka-ai: all tests passed');
