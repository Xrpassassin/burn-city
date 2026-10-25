import assert from 'node:assert/strict';
import {COVE_CLUES,nearestClue} from './cove-clues.mjs';
assert.equal(COVE_CLUES.length,3);
assert.equal(nearestClue({x:-60,z:-92}).id,'broken-manifest');
assert.equal(nearestClue({x:-60,z:-92},['broken-manifest']),null);
assert.equal(nearestClue({x:0,z:0}),null);
console.log('Cinder Cove clue discovery tests passed');
