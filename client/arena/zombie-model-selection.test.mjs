import assert from 'node:assert/strict';
import { selectZombieModelCandidates, stableZombieHash } from './zombie-model-selection.mjs';

const zombies = [
  { id: 'z-far', x: 35, z: 0 },
  { id: 'z-mid', x: 12, z: 0 },
  { id: 'z-near', x: 2, z: 0 },
  { id: 'z-edge', x: 28, z: 0 },
  { id: 'z-outside', x: 28.01, z: 0 }
];
assert.deepEqual(selectZombieModelCandidates(zombies, { x: 0, z: 0 }, 8, 28).map(z => z.id), ['z-near', 'z-mid', 'z-edge']);
assert.deepEqual(selectZombieModelCandidates(zombies, { x: 0, z: 0 }, 1, 28).map(z => z.id), ['z-near']);
assert.equal(stableZombieHash('enemy-7'), stableZombieHash('enemy-7'), 'variant selection must be stable');
assert.notEqual(stableZombieHash('enemy-7'), stableZombieHash('enemy-8'), 'different ids should normally hash differently');
assert.deepEqual(selectZombieModelCandidates(zombies, { x: 0, z: 0 }, 0, 28), []);
console.log('zombie model selection checks passed');
