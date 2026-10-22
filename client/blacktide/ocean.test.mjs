import assert from 'node:assert/strict';
import { sampleOceanHeight, sampleOceanSurface, updateOceanGeometry } from './ocean.js';

const a = sampleOceanSurface(12.5, -84.2, 3.1);
const b = sampleOceanSurface(12.5, -84.2, 3.1);
assert.deepEqual(a, b, 'spectrum must be deterministic');
for (const value of [a.height, a.slopeX, a.slopeZ]) {
  assert.ok(Number.isFinite(value), 'sample values must be finite');
}
assert.equal(sampleOceanHeight(12.5, -84.2, 3.1), a.height);

// The returned slopes should approximate the finite-difference surface gradient.
const epsilon = 0.01;
const dx = (sampleOceanHeight(12.5 + epsilon, -84.2, 3.1) -
  sampleOceanHeight(12.5 - epsilon, -84.2, 3.1)) / (2 * epsilon);
const dz = (sampleOceanHeight(12.5, -84.2 + epsilon, 3.1) -
  sampleOceanHeight(12.5, -84.2 - epsilon, 3.1)) / (2 * epsilon);
assert.ok(Math.abs(dx - a.slopeX) < 0.002, 'x slope should match finite difference');
assert.ok(Math.abs(dz - a.slopeZ) < 0.002, 'z slope should match finite difference');

const positionArray = new Float32Array([0, 0, 0, 12, 0, -5]);
const normalArray = new Float32Array(6);
const geometry = {
  attributes: {
    position: { array: positionArray, count: 2, needsUpdate: false },
    normal: { array: normalArray, needsUpdate: false }
  }
};
updateOceanGeometry(geometry, positionArray.slice(), 2.4);
assert.equal(geometry.attributes.position.needsUpdate, true);
assert.equal(geometry.attributes.normal.needsUpdate, true);
for (let i = 0; i < normalArray.length; i += 3) {
  const length = Math.hypot(normalArray[i], normalArray[i + 1], normalArray[i + 2]);
  assert.ok(Math.abs(length - 1) < 1e-5, 'normal vectors should be normalized');
}
assert.ok(Number.isFinite(positionArray[1]) && Number.isFinite(positionArray[4]));
console.log('Blacktide ocean tests passed');
