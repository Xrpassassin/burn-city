import assert from 'node:assert/strict';
import { validateCollectionIdentityEvidence } from './nft-collection-identity-validator.mjs';

const issuer = 'rXYdhW4ZHdzt27VuHJgNwbD1aJjcKZJ9M';
const base = {
  collectionKey: 'racc',
  canonicalName: 'RACC',
  marketplaceUrl: 'https://example.org/collection/racc',
  apiSlug: 'racc',
  issuer,
  taxon: 0,
  expectedCount: 2,
  retrievedAt: '2026-10-24T12:00:00Z',
  inventoryEvidenceUrl: 'https://example.org/api/inventory',
  collectionEvidenceUrl: 'https://example.org/api/collection',
  reviewer: 'reviewer-one',
  secondReviewer: 'reviewer-two',
  observedUniqueCount: 2,
  sampleTokens: [
    { tokenId: 'A'.repeat(64), issuer, taxon: 0 },
    { tokenId: 'B'.repeat(64), issuer, taxon: 0 }
  ]
};

assert.equal(validateCollectionIdentityEvidence(base).valid, true);
assert.equal(validateCollectionIdentityEvidence({ ...base, secondReviewer: 'reviewer-one' }).errors.some(e => e.code === 'MISSING_INDEPENDENT_REVIEW'), true);
assert.equal(validateCollectionIdentityEvidence({ ...base, sampleTokens: [base.sampleTokens[0], { ...base.sampleTokens[1], issuer: 'rWrongIssuerAddress111111111111' }] }).errors.some(e => e.code === 'INSUFFICIENT_VERIFIED_SAMPLES'), true);
assert.equal(validateCollectionIdentityEvidence({ ...base, sampleTokens: [base.sampleTokens[0], base.sampleTokens[0]] }).errors.some(e => e.code === 'INSUFFICIENT_VERIFIED_SAMPLES'), true);
assert.equal(validateCollectionIdentityEvidence({ ...base, observedUniqueCount: 1 }).errors.some(e => e.code === 'INVENTORY_COUNT_MISMATCH'), true);
assert.equal(validateCollectionIdentityEvidence({ ...base, taxon: -1 }).errors.some(e => e.code === 'INVALID_TAXON'), true);
assert.equal(validateCollectionIdentityEvidence({ ...base, issuer: 'not-an-xrpl-address' }).errors.some(e => e.code === 'INVALID_ISSUER'), true);
assert.equal(validateCollectionIdentityEvidence({ ...base, artworkRightsApproved: true }).valid, true, 'identity validator does not interpret rights flags');
console.log('NFT collection identity validator: 8 assertions passed');
