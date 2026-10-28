import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateCandidateCatalog } from './nft-avatar-model-candidates.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const catalog = JSON.parse(await readFile(path.join(root, 'assets/nft-avatars/model-candidates.json'), 'utf8'));
assert.deepEqual(validateCandidateCatalog(catalog), []);
assert.equal(catalog.status, 'research-only');
assert.ok(catalog.candidates.every(candidate => candidate.rightsStatus !== 'approved'), 'research candidates must not be implicitly approved');
assert.ok(catalog.candidates.some(candidate => candidate.intendedCollection === 'racc' && !candidate.sourceUrl), 'RACC remains unselected rather than inheriting a humanoid');
assert.ok(validateCandidateCatalog({ ...catalog, status: 'production-approved' }).some(error => error.includes('research-only')));
assert.ok(validateCandidateCatalog({ ...catalog, candidates: [catalog.candidates[0], catalog.candidates[0]] }).some(error => error.includes('unique')));
const falselyApproved = { ...catalog, candidates: [{ ...catalog.candidates[0], rightsStatus: 'approved', visualStatus: 'not-reviewed' }] };
assert.ok(validateCandidateCatalog(falselyApproved).some(error => error.includes('cannot be rights-approved')));
console.log('NFT avatar model candidate catalog: 6 assertions passed');
