import assert from 'node:assert/strict';
import { advanceExperience, xpThreshold } from './progression-core.mjs';

// Preserve the current live XP curve for single- and multi-class characters.
assert.equal(xpThreshold(1, 1), 60);
assert.equal(xpThreshold(1, 2), 69);
assert.equal(xpThreshold(1, 3), 78);
assert.equal(xpThreshold(2, 1), Math.round(60 * Math.pow(2, 1.45)));

const oneThreshold = xpThreshold(1, 1);
assert.deepEqual(advanceExperience({ level: 1, xp: 0 }, oneThreshold - 1, 1), {
  level: 1, xp: oneThreshold - 1, levelsGained: []
});
assert.deepEqual(advanceExperience({ level: 1, xp: 0 }, oneThreshold, 1), {
  level: 2, xp: 0, levelsGained: [2]
});

// Existing XP plus an award may cross more than one level threshold.
const twoThresholds = oneThreshold + xpThreshold(2, 1);
assert.deepEqual(advanceExperience({ level: 1, xp: 0 }, twoThresholds + 7, 1), {
  level: 3, xp: 7, levelsGained: [2, 3]
});

// Existing partial XP is carried into the award, and inputs are not mutated.
const input = { level: 1, xp: 10 };
assert.deepEqual(advanceExperience(input, oneThreshold - 10, 1), {
  level: 2, xp: 0, levelsGained: [2]
});
assert.deepEqual(input, { level: 1, xp: 10 });

// Optional cap is available for future designs but is not enabled by default.
assert.deepEqual(advanceExperience({ level: 1, xp: 0 }, 100000, 1, 2), {
  level: 2, xp: 100000 - oneThreshold, levelsGained: [2]
});

for (const fn of [
  () => xpThreshold(0, 1),
  () => xpThreshold(1.5, 1),
  () => xpThreshold(1, 0),
  () => xpThreshold(1, 4),
  () => advanceExperience({ level: 1, xp: -1 }, 1),
  () => advanceExperience({ level: 1, xp: 0 }, -1),
  () => advanceExperience({ level: 1, xp: 0 }, NaN),
  () => advanceExperience({ level: 1, xp: 0 }, 1, 1, 0)
]) assert.throws(fn);

console.log('Eternal Grind progression core: all tests passed');
