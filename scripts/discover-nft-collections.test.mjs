import assert from 'node:assert/strict';
import { normalizeName, scoreCandidate, normalizeCandidate } from './discover-nft-collections.mjs';

assert.equal(normalizeName('  RACC—Guy 1979! '), 'racc guy 1979');
assert.equal(scoreCandidate({ name: 'RACC' }, ['racc']), 100);
assert.equal(scoreCandidate({ name: 'The 589 Protocol Collection' }, ['589 protocol']), 70);
assert.equal(scoreCandidate({ name: 'Firekeepers Genesis' }, ['firekeepers']), 70);
assert.equal(scoreCandidate({ name: 'Unrelated collection' }, ['racc', '589 protocol', 'firekeepers']), 0);
const candidate = normalizeCandidate({
  name: 'RACC', slug: 'racc', issuer: 'rXYdhW4ZHdzt27VuHJgNwbD1aJjcKZJ9M',
  taxon: 0, items: 100, url: 'https://xrp.cafe/collection/racc'
});
assert.equal(candidate.taxon, 0);
assert.equal(candidate.expectedCount, 100);
assert.equal(candidate.identityReadyForReview, true);
assert.equal(normalizeCandidate({ name: 'RACC', slug: 'racc', issuer: 'x', taxon: null, items: null }).expectedCount, null);
assert.equal(normalizeCandidate({ name: 'RACC', slug: 'racc' }).identityReadyForReview, false);
console.log('NFT collection discovery tests passed (10 assertions).');
