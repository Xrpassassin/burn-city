import assert from 'node:assert/strict';
import { getWildsGraphicsProfile, isWildsGraphicsProfile, WILDS_GRAPHICS_PROFILES } from './wilds-graphics-profiles.mjs';

assert.deepEqual(getWildsGraphicsProfile('balanced'), { fog: 1, sway: 1, shafts: 1 });
assert.equal(getWildsGraphicsProfile('cinematic').fog, 1.18);
assert.equal(getWildsGraphicsProfile('cinematic').sway, 1.25);
assert.equal(getWildsGraphicsProfile('cinematic').shafts, 1.35);
assert.equal(getWildsGraphicsProfile('mobile').sway, 0.65);
assert.equal(getWildsGraphicsProfile('mobile').shafts, 0.6);
assert.equal(getWildsGraphicsProfile('unknown'), WILDS_GRAPHICS_PROFILES.balanced);
assert.equal(isWildsGraphicsProfile('cinematic'), true);
assert.equal(isWildsGraphicsProfile('unknown'), false);
assert.equal(Object.isFrozen(WILDS_GRAPHICS_PROFILES.cinematic), true);
console.log('wilds-graphics-profiles: all tests passed');
