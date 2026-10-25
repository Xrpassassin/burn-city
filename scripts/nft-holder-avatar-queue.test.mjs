import assert from 'node:assert/strict';
import { compileHolderAvatarQueue } from './nft-holder-avatar-queue.mjs';
const id = 'A'.repeat(64);
const second = 'B'.repeat(64);
const snapshots = [
  { wallet: 'must-not-be-exported', nfts: [
    { key: 'racc', id, name: 'RACC One', traits: [['Fits', 'Sweater']] },
    { key: 'fk', id: second, name: 'Keeper', traits: [] },
    { key: '589', id: 'not-a-token', name: 'Invalid' },
    { key: 'other', id, name: 'Unsupported' }
  ] },
  { nfts: [{ key: 'racc', id, name: 'Duplicate', traits: [] }, { key: '589', id: 'C'.repeat(64), pending: true }] }
];
const result = compileHolderAvatarQueue(snapshots);
assert.equal(result.count, 2);
assert.equal(result.skipped, 3);
assert.equal(result.queue[0].status, 'needs_art_review');
assert.ok(result.queue.every(t => t.spec.production.runtimeApproved === false));
assert.ok(result.queue.every(t => t.spec.reconstruction.exactReconstruction === false));
assert.ok(!JSON.stringify(result).includes('must-not-be-exported'));
assert.throws(() => compileHolderAvatarQueue({}), /array/);
console.log('NFT verified-holder production queue tests passed.');
