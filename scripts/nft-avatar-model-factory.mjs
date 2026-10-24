#!/usr/bin/env node
/**
 * BURN City NFT model-factory manifest gate.
 * Validates provenance and runtime approval metadata; it does not generate or
 * visually validate a 3D model.
 * Usage: node scripts/nft-avatar-model-factory.mjs path/to/manifest.json
 */
import fs from 'node:fs';
import path from 'node:path';

export function validateModelManifest(manifest) {
  const errors = [];
  const fail = (message) => errors.push(message);
  const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
  const text = (value) => typeof value === 'string' && value.trim().length > 0;
  const hash = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value);
  if (!object(manifest)) return ['manifest must be a JSON object'];
  if (manifest.schemaVersion !== 1) fail('schemaVersion must be 1');
  for (const key of ['collection', 'identity', 'source', 'rights', 'build', 'review']) {
    if (!object(manifest[key])) fail(key + ' must be an object');
  }
  if (errors.length) return errors;
  if (!/^[a-z0-9][a-z0-9-]*$/.test(manifest.collection.key ?? '')) fail('collection.key must be lowercase kebab-case');
  if (!text(manifest.collection.displayName)) fail('collection.displayName is required');
  if (!text(manifest.identity.tokenId)) fail('identity.tokenId is required');
  if (!object(manifest.identity.traitSnapshot)) fail('identity.traitSnapshot must be an object');
  if (manifest.identity.artworkSha256 != null && !hash(manifest.identity.artworkSha256)) fail('identity.artworkSha256 must be a SHA-256 hex digest');
  if (!['authored','generated','third-party','procedural'].includes(manifest.source.kind)) fail('source.kind is unsupported');
  if (!['glb','gltf','fbx','blend','obj','procedural'].includes(manifest.source.format)) fail('source.format is unsupported');
  if (!['meters','centimeters','millimeters','unknown'].includes(manifest.source.units)) fail('source.units is unsupported');
  if (manifest.source.sha256 != null && !hash(manifest.source.sha256)) fail('source.sha256 must be a SHA-256 hex digest');
  if (!['allowed','not-allowed','unknown'].includes(manifest.rights.redistribution)) fail('rights.redistribution is unsupported');
  if (!['approved','pending','rejected'].includes(manifest.rights.reviewStatus)) fail('rights.reviewStatus is unsupported');
  for (const field of ['license','author']) if (!text(manifest.rights[field])) fail('rights.' + field + ' is required');
  if (manifest.rights.reviewStatus === 'approved' && manifest.rights.redistribution !== 'allowed') fail('approved rights require redistribution=allowed');
  if (!text(manifest.build.pipelineVersion)) fail('build.pipelineVersion is required');
  if (!['planned','source-ready','processing','built','failed'].includes(manifest.build.status)) fail('build.status is unsupported');
  if (manifest.build.outputSha256 != null && !hash(manifest.build.outputSha256)) fail('build.outputSha256 must be a SHA-256 hex digest');
  if (manifest.review.approvedForRuntime === true) {
    if (manifest.build.status !== 'built') fail('runtime approval requires build.status=built');
    if (manifest.rights.reviewStatus !== 'approved' || manifest.rights.redistribution !== 'allowed') fail('runtime approval requires approved rights and redistribution=allowed');
    if (manifest.review.visualQa !== 'pass') fail('runtime approval requires review.visualQa=pass');
    if (manifest.review.mobilePerf !== 'pass') fail('runtime approval requires review.mobilePerf=pass');
    if (!text(manifest.build.outputUri) || !hash(manifest.build.outputSha256)) fail('runtime approval requires outputUri and output SHA-256');
  }
  if (!['not-run','pass','fail'].includes(manifest.review.visualQa)) fail('review.visualQa is unsupported');
  if (!['not-run','pass','fail'].includes(manifest.review.mobilePerf)) fail('review.mobilePerf is unsupported');
  return errors;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const filename = process.argv[2];
  if (!filename) {
    console.error('Usage: node scripts/nft-avatar-model-factory.mjs path/to/manifest.json');
    process.exitCode = 2;
  } else {
    try {
      const manifest = JSON.parse(fs.readFileSync(filename, 'utf8'));
      const errors = validateModelManifest(manifest);
      if (errors.length) {
        console.error('Model manifest rejected:');
        for (const error of errors) console.error(' - ' + error);
        process.exitCode = 1;
      } else {
        console.log('Model manifest valid. Runtime eligibility still requires explicit review approval.');
      }
    } catch (error) {
      console.error('Unable to read/parse manifest:', error.message);
      process.exitCode = 2;
    }
  }
}
