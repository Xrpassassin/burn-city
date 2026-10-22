import assert from 'node:assert/strict';
import { validateWorldRoute } from './wilds-route-validation.mjs';

const path = [{ x: 0, z: 0 }, { x: 4, z: 0 }, { x: 4, z: 3 }];
const clear = validateWorldRoute({ path, isBlocked: () => false });
assert.equal(clear.valid, true);
assert.equal(clear.segmentCount, 2);
assert.ok(clear.samplesChecked > 2);

const blocked = validateWorldRoute({ path, isBlocked: x => x >= 1.5 && x <= 2.5 });
assert.equal(blocked.valid, false);
assert.equal(blocked.reason, 'blocked');
assert.equal(blocked.segmentIndex, 0);
assert.ok(blocked.point.x >= 1.5 && blocked.point.x <= 2.5);

const outside = validateWorldRoute({ path, isBlocked: () => false, isOutsidePlayableArea: (_x, z) => z > 1 });
assert.equal(outside.reason, 'outside-playable-area');

const endpointBlocked = validateWorldRoute({ path, isBlocked: (x, z) => x === 0 && z === 0 });
assert.equal(endpointBlocked.reason, 'blocked');
assert.equal(endpointBlocked.segmentIndex, 0);

const sampleLimit = validateWorldRoute({ path: [{ x: 0, z: 0 }, { x: 100, z: 0 }], isBlocked: () => false, sampleSpacing: 0.1, maxSamples: 5 });
assert.equal(sampleLimit.reason, 'sample-limit');
assert.equal(sampleLimit.samplesChecked, 5);

const queryError = validateWorldRoute({ path, isBlocked: () => { throw new Error('unavailable'); } });
assert.equal(queryError.reason, 'world-query-error');
assert.equal(validateWorldRoute({ path: [{ x: 0, z: 0 }], isBlocked: () => false }), null);
assert.equal(validateWorldRoute({ path, isBlocked: null }), null);
assert.equal(validateWorldRoute({ path, isBlocked: () => false, sampleSpacing: 0 }), null);
console.log('wilds-route-validation: all tests passed');
