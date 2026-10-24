import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateAsset, validateManifest } from './nft-avatar-asset-pipeline.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const collectionDir = path.join(root, 'assets', 'nft-avatars', 'collections');
let checks = 0;
function check(condition, message) { assert.ok(condition, message); checks++; }

const files = (await readdir(collectionDir)).filter(file => file.endsWith('.json')).sort();
for (const required of ['589.json', 'fk.json', 'racc.json']) check(files.includes(required), 'includes initial collection manifest ' + required);
for (const file of files) {
  const manifest = JSON.parse(await readFile(path.join(collectionDir, file), 'utf8'));
  assert.deepEqual(validateManifest(manifest, file), [], file + ' should pass manifest validation');
  checks++;
}
const base = {
  schemaVersion: 1,
  collectionKey: 'test-collection',
  collectionName: 'Test Collection',
  collectionIdentity: { issuer: null, taxon: null, verified: false },
  traitMappings: [{ slot: 'headwear', aliases: ['Helmet', 'Headgear'] }],
  assets: [],
  qaSamples: [{ tokenReference: 'review-only:sample-001', coverage: ['common traits', 'rare accessory', 'mobile silhouette'] }]
};
check(validateManifest({ ...base, collectionKey: '../escape' }).some(error => error.includes('collectionKey')), 'rejects unsafe collection keys');
check(validateManifest({ ...base, traitMappings: [{ slot: 'x', aliases: ['Hat'] }, { slot: 'y', aliases: ['hat'] }] }).some(error => error.includes('duplicate trait alias')), 'rejects ambiguous duplicate aliases');
check(validateManifest({ ...base, collectionIdentity: { issuer: null, taxon: 1, verified: true } }).some(error => error.includes('requires an issuer')), 'does not permit unverified issuer identity to be marked verified');
check(validateManifest({ ...base, qaSamples: [] }).length === 0, 'allows an empty QA sample list before intake begins');
check(validateAsset({ id: 'x', kind: 'model', path: '../outside.glb', sha256: '0'.repeat(64), sourceUrl: 'https://example.org/model', rights: { reviewed: true, status: 'approved', license: 'CC0', redistributionAllowed: true, attribution: '' }, model: { format: 'glb', units: 'meters', rigged: true, animationCompatible: true, polyCount: 1000 } }).some(error => error.includes('safe repository-relative')), 'rejects path traversal');
check(validateAsset({ id: 'x', kind: 'model', path: 'assets/nft-avatars/models/test.glb', sha256: '0'.repeat(64), sourceUrl: 'https://example.org/model', rights: { reviewed: false, status: 'pending-review', license: 'unknown', redistributionAllowed: false, attribution: '' }, model: { format: 'glb', units: 'unknown', rigged: false, animationCompatible: false, polyCount: 0 } }).some(error => error.includes('rights.reviewed')), 'blocks assets without completed rights review');
check(validateAsset({ id: 'x', kind: 'model', path: 'assets/nft-avatars/models/test.glb', sha256: '0'.repeat(64), sourceUrl: 'https://example.org/model', rights: { reviewed: true, status: 'approved', license: 'CC0', redistributionAllowed: true, attribution: '' }, model: { format: 'blend', units: 'meters', rigged: true, animationCompatible: true, polyCount: 1000 } }).some(error => error.includes('format')), 'rejects unapproved model formats');
check(validateAsset({ id: 'x', kind: 'animation', path: 'assets/nft-avatars/animations/test.glb', sha256: '0'.repeat(64), sourceUrl: 'https://example.org/anim', rights: { reviewed: true, status: 'approved', license: 'CC0', redistributionAllowed: true, attribution: '' } }).some(error => error.includes('animation.skeleton')), 'requires animation skeleton compatibility metadata');
check(validateAsset({ id: 'x', kind: 'layer', path: 'assets/nft-avatars/layers/test.png', sha256: '0'.repeat(64), sourceUrl: 'https://example.org/layer', rights: { reviewed: true, status: 'approved', license: 'CC0', redistributionAllowed: true, attribution: '' } }).length === 0, 'accepts a complete reviewed layer asset record');

console.log('NFT avatar asset pipeline: ' + checks + ' assertions passed');
