import assert from 'node:assert/strict';
import { buildQueueFromIntake } from './nft-holder-avatar-export.mjs';
const a = 'A'.repeat(64), b = 'B'.repeat(64);
const intake = { version: 1, tokens: {
  [a]: { id: a, key: 'racc', firstVerifiedAt: 1, lastVerifiedAt: 2 },
  [b]: { id: b, key: 'fk', firstVerifiedAt: 1, lastVerifiedAt: 2 }
} };
const result = buildQueueFromIntake(intake, id => id === a ? { id, key: 'racc', name: 'RACC', traits: [['Fits','Yellow Sweater']] } : null);
assert.equal(result.count, 1);
assert.equal(result.verifiedTokenCount, 2);
assert.deepEqual(result.missingMetadata, [{ id: b, key: 'fk' }]);
assert.equal(result.queue[0].status, 'needs_art_review');
assert.ok(!JSON.stringify(result).includes('firstVerifiedAt'));
assert.throws(() => buildQueueFromIntake({}, () => null), /Invalid token intake/);
console.log('Verified holder intake export tests passed.');
