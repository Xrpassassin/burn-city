import assert from 'node:assert/strict';
import { reconcileNftInventory } from './nft-inventory-reconciliation.mjs';

const idA = 'A'.repeat(64);
const idB = 'B'.repeat(64);
const identity = { slug: 'verified-collection', issuer: 'rIssuer', taxon: 7 };
const candidate = { name: 'Example Collection', slug: 'example', issuer: 'rCandidate', taxon: 7, expectedCount: 2 };

const complete = reconcileNftInventory({
  candidate,
  verifiedIdentity: identity,
  expectedCount: 2,
  tokens: [
    { NFTokenID: idA, issuer: 'rIssuer', taxon: 7, meta: { name: 'A', image: 'https://example.test/a.png', attributes: [{ trait_type: 'Hat', value: 'Straw' }] } },
    { NFTokenID: idB, issuer: 'rIssuer', taxon: 7, meta: { name: 'B', image: 'ipfs://b', attributes: [{ trait_type: 'Coat', value: 'Striped' }] } }
  ]
});
assert.equal(complete.inventoryComplete, true);
assert.equal(complete.approved, false);
assert.equal(complete.ingestionEnabled, false);
assert.equal(complete.observedUniqueCount, 2);
assert.equal(complete.missingArtwork, 0);
assert.equal(complete.missingTraits, 0);

const duplicate = reconcileNftInventory({
  candidate, verifiedIdentity: identity, expectedCount: 2,
  tokens: [
    { NFTokenID: idA, issuer: 'rIssuer', taxon: 7, artworkUrl: 'https://example.test/a.png', rawTraits: [{ type: 'Hat', value: 'Straw' }] },
    { NFTokenID: idA, issuer: 'rIssuer', taxon: 7 }
  ]
});
assert.equal(duplicate.observedUniqueCount, 1);
assert.equal(duplicate.duplicateTokenIds.length, 1);
assert.equal(duplicate.inventoryComplete, false);
assert.ok(duplicate.issues.some(issue => issue.code === 'DUPLICATE_TOKEN_ID'));

const mismatch = reconcileNftInventory({
  candidate, verifiedIdentity: identity, expectedCount: 1,
  tokens: [{ NFTokenID: idA, issuer: 'rWrong', taxon: 9, meta: {} }]
});
assert.equal(mismatch.issuerMismatches, 1);
assert.equal(mismatch.taxonMismatches, 1);
assert.equal(mismatch.inventoryComplete, false);

const incomplete = reconcileNftInventory({
  candidate, verifiedIdentity: identity, expectedCount: 2,
  tokens: [{ NFTokenID: 'not-an-id', issuer: 'rIssuer', taxon: 7 }],
  pageErrors: [{ code: 'PAGE_FETCH_FAILED', offset: 200 }]
});
assert.equal(incomplete.invalidTokenIds, 1);
assert.equal(incomplete.pageErrors.length, 1);
assert.equal(incomplete.inventoryComplete, false);
assert.equal(incomplete.missingArtwork, 1);
assert.equal(incomplete.missingMetadata, 1);
assert.equal(incomplete.missingTraits, 1);

const unverified = reconcileNftInventory({
  candidate, expectedCount: 0, tokens: []
});
assert.equal(unverified.identityVerified, false);
assert.equal(unverified.inventoryComplete, false);
assert.equal(unverified.approved, false);

console.log('NFT inventory reconciliation tests passed (5 scenarios).');
