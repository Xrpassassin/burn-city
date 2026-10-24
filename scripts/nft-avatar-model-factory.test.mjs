import assert from 'node:assert/strict';
import { validateModelManifest } from './nft-avatar-model-factory.mjs';

const base = {
  schemaVersion: 1,
  collection: { key: 'racc', displayName: 'RACC' },
  identity: { tokenId: 'sample-001', artworkReference: 'fixture', traitSnapshot: { Fits: 'Jacket' }, artworkSha256: null },
  source: { kind: 'procedural', format: 'procedural', units: 'meters', sha256: null, polygonCount: null },
  rights: { license: 'BURN City authored', author: 'BURN City', redistribution: 'allowed', reviewStatus: 'approved' },
  build: { pipelineVersion: '0.1.0', status: 'built', outputUri: 'assets/nft-avatars/models/racc/sample.glb', outputSha256: 'a'.repeat(64), outputBytes: 120000 },
  review: { visualQa: 'pass', mobilePerf: 'pass', approvedForRuntime: true }
};
assert.deepEqual(validateModelManifest(base), [], 'reviewed model passes');
assert(validateModelManifest({ ...base, schemaVersion: 2 }).some((e) => e.includes('schemaVersion')));
assert(validateModelManifest({ ...base, collection: { ...base.collection, key: 'RACC!' } }).some((e) => e.includes('kebab-case')));
assert(validateModelManifest({ ...base, rights: { ...base.rights, redistribution: 'unknown' } }).some((e) => e.includes('redistribution=allowed')));
assert(validateModelManifest({ ...base, review: { ...base.review, visualQa: 'not-run' } }).some((e) => e.includes('visualQa=pass')));
assert(validateModelManifest({ ...base, review: { ...base.review, mobilePerf: 'fail' } }).some((e) => e.includes('mobilePerf=pass')));
assert(validateModelManifest({ ...base, build: { ...base.build, outputSha256: 'bad' } }).some((e) => e.includes('output SHA-256')));
assert(validateModelManifest(null).length > 0);
const draft = structuredClone(base);
draft.rights.reviewStatus = 'pending';
draft.review.approvedForRuntime = false;
assert.deepEqual(validateModelManifest(draft), [], 'unapproved draft remains trackable');
console.log('NFT avatar model-factory tests passed (9 assertions).');
