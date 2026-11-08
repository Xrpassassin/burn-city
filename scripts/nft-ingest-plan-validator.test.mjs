import assert from 'node:assert/strict';
import { validateIngestPlan } from './nft-ingest-plan-validator.mjs';

const valid = {
  key: 'racc', displayName: 'RACC', slug: 'racc', issuer: 'rXYdhW4ZHdzt27VuHJgNwbD1aJjcKZJ9M',
  taxon: 0, expectedCount: 100, status: 'verified'
};
const placeholders = [
  { key: 'racc', slug: null, issuer: null, taxon: null, expectedCount: null, status: 'needs-identity-verification' },
  { key: '589', slug: null, issuer: null, taxon: null, expectedCount: null, status: 'needs-identity-verification' }
];
assert.deepEqual(validateIngestPlan(placeholders), { configured: [], errors: [] });
assert.deepEqual(validateIngestPlan([valid]).errors, []);
assert.equal(validateIngestPlan([valid]).configured.length, 1);
assert.equal(validateIngestPlan([{ ...valid, issuer: null }]).errors[0].code, 'PARTIAL_COLLECTION_IDENTITY');
assert.equal(validateIngestPlan([{ ...valid, slug: 'bad slug' }]).errors.some(e => e.code === 'INVALID_COLLECTION_SLUG'), true);
assert.equal(validateIngestPlan([{ ...valid, issuer: 'not-an-address' }]).errors.some(e => e.code === 'INVALID_CLASSIC_ISSUER_FORMAT'), true);
assert.equal(validateIngestPlan([{ ...valid, taxon: -1 }]).errors.some(e => e.code === 'INVALID_TAXON'), true);
assert.equal(validateIngestPlan([{ ...valid, expectedCount: 0 }]).errors.some(e => e.code === 'INVALID_EXPECTED_COUNT'), true);
assert.equal(validateIngestPlan([valid, { ...valid, key: 'racc-copy' }]).errors.some(e => e.code === 'DUPLICATE_COLLECTION_SLUG'), true);
assert.equal(validateIngestPlan([valid, { ...valid, key: 'racc-copy', slug: 'racc-copy' }]).errors.some(e => e.code === 'DUPLICATE_ISSUER_TAXON'), true);
assert.equal(validateIngestPlan([{ ...valid, key: 'racc' }, { ...valid, key: 'racc' }]).errors.some(e => e.code === 'INVALID_OR_DUPLICATE_COLLECTION_KEY'), true);
console.log('NFT ingest plan validator tests passed (11 assertions).');
