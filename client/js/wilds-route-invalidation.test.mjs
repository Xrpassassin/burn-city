import assert from 'node:assert/strict';
import { assessRouteFreshness } from './wilds-route-invalidation.mjs';

const path = [{ x: 0, z: 0 }, { x: 4, z: 0 }];

let queried = 0;
const unchanged = assessRouteFreshness({
  path, validatedRevision: 7, currentRevision: 7,
  isBlocked: () => { queried++; return false; },
});
assert.equal(unchanged.shouldReplan, false);
assert.equal(unchanged.reason, 'world-revision-unchanged');
assert.equal(queried, 0, 'same revision should avoid world sampling');

const stillClear = assessRouteFreshness({
  path, validatedRevision: 7, currentRevision: 8,
  isBlocked: () => false,
});
assert.equal(stillClear.shouldReplan, false);
assert.equal(stillClear.reason, 'route-revalidated');
assert.equal(stillClear.validatedRevision, 8);
assert.equal(stillClear.validation.valid, true);

const newlyBlocked = assessRouteFreshness({
  path, validatedRevision: 7, currentRevision: 8,
  sampleSpacing: 0.25,
  isBlocked: x => x >= 1.9 && x <= 2.1,
});
assert.equal(newlyBlocked.stale, true);
assert.equal(newlyBlocked.shouldReplan, true);
assert.equal(newlyBlocked.reason, 'route-invalid-blocked');
assert.equal(newlyBlocked.validation.reason, 'blocked');

const outside = assessRouteFreshness({
  path, validatedRevision: 'forest-a', currentRevision: 'forest-b',
  isBlocked: () => false,
  isOutsidePlayableArea: (x) => x > 3,
});
assert.equal(outside.shouldReplan, true);
assert.equal(outside.validation.reason, 'outside-playable-area');

const sampleLimit = assessRouteFreshness({
  path, validatedRevision: 1, currentRevision: 2,
  sampleSpacing: 0.001, maxSamples: 2, isBlocked: () => false,
});
assert.equal(sampleLimit.shouldReplan, true);
assert.equal(sampleLimit.validation.reason, 'sample-limit');

assert.equal(assessRouteFreshness({ path, validatedRevision: null, currentRevision: 2, isBlocked: () => false }), null);
assert.equal(assessRouteFreshness({ path, validatedRevision: 1, currentRevision: 2, isBlocked: null }), null);

console.log('route invalidation tests passed');
