import assert from 'node:assert/strict';
import { DEFAULT_ENVIRONMENT_REPAIR, applyEnvironmentDamage, createEnvironmentDamageState, environmentDamageStage, setEnvironmentOccupied, tickEnvironmentRepair } from '../client/arena/homefront-environment-damage.mjs';

const wall = createEnvironmentDamageState({ id: 'block-4:wall-north', maxHealth: 100 });
assert.equal(wall.stage, 'intact');
assert.equal(environmentDamageStage(84), 'scuffed');
assert.equal(environmentDamageStage(59), 'damaged');
assert.equal(environmentDamageStage(29), 'critical');
assert.equal(environmentDamageStage(0), 'destroyed');

const damaged = applyEnvironmentDamage(wall, 70, 1000);
assert.equal(damaged.health, 30);
assert.equal(damaged.stage, 'damaged');
assert.equal(damaged.unoccupiedSince, null);
assert.equal(wall.health, 100, 'damage transitions do not mutate the prior snapshot');

const occupied = setEnvironmentOccupied(damaged, true, 2000);
const left = setEnvironmentOccupied(occupied, false, 3000);
assert.equal(left.unoccupiedSince, 3000);
assert.equal(tickEnvironmentRepair(left, 3000 + DEFAULT_ENVIRONMENT_REPAIR.graceMs - 1).health, 30, 'repair waits for the full empty-cell grace period');
const halfway = tickEnvironmentRepair(left, 3000 + DEFAULT_ENVIRONMENT_REPAIR.graceMs + DEFAULT_ENVIRONMENT_REPAIR.durationMs / 2);
assert.equal(halfway.health, 65, 'repair gradually restores health after the grace period');
assert.equal(halfway.stage, 'scuffed');

const interrupted = setEnvironmentOccupied(halfway, true, 60000);
const leaveAgain = setEnvironmentOccupied(interrupted, false, 61000);
assert.equal(tickEnvironmentRepair(leaveAgain, 61000 + DEFAULT_ENVIRONMENT_REPAIR.graceMs).health, 65, 'a player re-entering interrupts repair and restarts the grace period on exit');
const fullyRepaired = tickEnvironmentRepair(leaveAgain, 61000 + DEFAULT_ENVIRONMENT_REPAIR.graceMs + DEFAULT_ENVIRONMENT_REPAIR.durationMs);
assert.equal(fullyRepaired.health, 100);
assert.equal(fullyRepaired.stage, 'intact');

const destroyed = applyEnvironmentDamage(wall, 500, 5000);
assert.equal(destroyed.health, 0);
assert.equal(destroyed.stage, 'destroyed');
const newlyDamaged = applyEnvironmentDamage(fullyRepaired, 1, 70000);
assert.equal(newlyDamaged.unoccupiedSince, null, 'new damage cancels any pending repair window');
assert.throws(() => createEnvironmentDamageState({ id: '' }), /stable id/);
assert.throws(() => applyEnvironmentDamage(wall, -1), /non-negative/);
assert.throws(() => tickEnvironmentRepair(left, 0, { durationMs: 0 }), /durationMs/);
console.log('Homefront environment damage/repair state tests passed.');