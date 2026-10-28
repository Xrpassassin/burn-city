import assert from 'node:assert/strict';
import { normalizeName, normalizeCandidate, scoreCandidate } from './discover-nft-collections.mjs';
import { reconcileNftInventory } from './nft-inventory-reconciliation.mjs';

const rows = [
  { name: 'RACC Guy', slug: 'racc-guy', issuer: 'rIssuer', taxon: 0, items: 100, url: 'https://xrp.cafe/collection/racc-guy' },
  { name: '589 Protocol', slug: '589-protocol', issuer: 'r589', taxon: 2, items: 589 },
  { name: 'Firekeepers', slug: 'firekeepers', issuer: 'rFire', taxon: 5, items: 42 },
  { name: 'Unrelated Collection', slug: 'unrelated', issuer: 'rOther', taxon: 1, items: 10 }
];

assert.equal(normalizeName(' 589—Protocol '), '589 protocol');
assert.ok(scoreCandidate(rows[0], ['racc']) >= 70);
assert.ok(scoreCandidate(rows[1], ['589 protocol']) >= 70);
assert.ok(scoreCandidate(rows[2], ['firekeepers']) >= 70);
assert.equal(scoreCandidate(rows[3], ['firekeepers']), 0);

const candidate = normalizeCandidate(rows[0]);
assert.equal(candidate.slug, 'racc-guy');
assert.equal(candidate.issuer, 'rIssuer');
assert.equal(candidate.taxon, 0);
assert.equal(candidate.expectedCount, 100);
assert.equal(candidate.identityReadyForReview, true);

const candidateOnly = reconcileNftInventory({ candidate, expectedCount: 100, tokens: [] });
assert.equal(candidateOnly.identityVerified, false);
assert.equal(candidateOnly.approved, false);
assert.equal(candidateOnly.ingestionEnabled, false);
assert.equal(candidateOnly.inventoryComplete, false);
const mechanicallyMatched = reconcileNftInventory({
  candidate, expectedCount: 0,
  expectedIdentity: { slug: 'racc-guy', issuer: 'rIssuer', taxon: 0 },
  tokens: []
});
assert.equal(mechanicallyMatched.identityVerified, false);
assert.equal(mechanicallyMatched.inventoryComplete, false);

const badCount = reconcileNftInventory({
  candidate, expectedCount: 2,
  verifiedIdentity: { slug: 'racc-guy', issuer: 'rIssuer', taxon: 0 },
  tokens: [{ NFTokenID: 'A'.repeat(64), issuer: 'rIssuer', taxon: 0 }]
});
assert.equal(badCount.observedUniqueCount, 1);
assert.ok(badCount.issues.some(issue => issue.code === 'INVENTORY_COUNT_MISMATCH'));
assert.equal(badCount.approved, false);

console.log('NFT discovery-to-reconciliation integration tests passed (6 assertions).');
