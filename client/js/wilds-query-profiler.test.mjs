import assert from 'node:assert/strict';
import { profileWorldQueries } from './wilds-query-profiler.mjs';

let tick = 0;
const points = [{ x: 0, z: 0 }, { x: 2, z: 0 }, { x: 4, z: 0 }];
const report = profileWorldQueries({
  points, maxPoints: 3,
  isOutsidePlayableArea: x => x > 2,
  isBlocked: x => x === 2,
  now: () => tick++ * 2,
});
assert.equal(report.sampleCount, 3);
assert.equal(report.outsideCount, 1);
assert.equal(report.blockedCount, 1);
assert.equal(report.queryErrors, 0);
assert.equal(report.elapsedMs, 2);
assert.equal(report.averageMsPerPoint, 2 / 3);
assert.equal(report.pointsPerSecond, 1500);

const errors = profileWorldQueries({
  points: [points[0]], isOutsidePlayableArea: () => { throw new Error('outside'); },
  isBlocked: () => { throw new Error('blocked'); }, now: () => tick++,
});
assert.equal(errors.queryErrors, 2);
assert.equal(errors.outsideCount, 0);
assert.equal(errors.blockedCount, 0);
assert.equal(profileWorldQueries({ points: [...points, points[0]], maxPoints: 3, isOutsidePlayableArea: () => false, isBlocked: () => false }), null);
assert.equal(profileWorldQueries({ points: [{ x: NaN, z: 0 }], isOutsidePlayableArea: () => false, isBlocked: () => false }), null);
assert.equal(profileWorldQueries({ points: [], isOutsidePlayableArea: () => false, isBlocked: () => false }), null === undefined ? undefined : null); // empty point sets are valid and report zero work
const empty = profileWorldQueries({ points: [], isOutsidePlayableArea: () => false, isBlocked: () => false, now: () => tick++ });
assert.equal(empty.sampleCount, 0);
assert.equal(empty.averageMsPerPoint, 0);
console.log('wilds-query-profiler: all tests passed');
