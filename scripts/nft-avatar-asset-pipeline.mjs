#!/usr/bin/env node
/**
 * BURN City NFT avatar asset intake gate.
 *
 * This tool validates reviewed manifests; it does not fetch or execute remote assets,
 * infer ownership, or declare third-party licenses valid. Human rights review remains required.
 */
import { readFile, readdir, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const COLLECTION_DIR = path.join(ROOT, 'assets', 'nft-avatars', 'collections');
const SAFE_KEY = /^[a-z0-9][a-z0-9-]{0,63}$/;
const SHA256 = /^[a-f0-9]{64}$/i;
const ASSET_KINDS = new Set(['layer', 'model', 'texture', 'animation', 'reference-art']);
const MODEL_FORMATS = new Set(['glb', 'gltf', 'fbx', 'obj']);
const LICENSE_STATUSES = new Set(['approved', 'pending-review', 'restricted', 'rejected']);

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function safeRepoPath(value) {
  if (typeof value !== 'string' || !value.trim() || value.includes('\\') || value.startsWith('/')) return false;
  if (/^[a-z]+:\/\//i.test(value) || /^[a-z]:/i.test(value)) return false;
  const parts = value.split('/');
  return parts.every(part => part && part !== '.' && part !== '..');
}

export function validateAsset(asset, index = 0) {
  const errors = [];
  const prefix = `assets[${index}]`;
  if (!isRecord(asset)) return [`${prefix} must be an object`];
  if (!SAFE_KEY.test(String(asset.id || ''))) errors.push(`${prefix}.id must be a stable lowercase slug`);
  if (!ASSET_KINDS.has(asset.kind)) errors.push(`${prefix}.kind is unsupported`);
  if (!safeRepoPath(asset.path)) errors.push(`${prefix}.path must be a safe repository-relative path`);
  if (!SHA256.test(String(asset.sha256 || ''))) errors.push(`${prefix}.sha256 must be a 64-character SHA-256 digest`);
  if (typeof asset.sourceUrl !== 'string' || !/^https:\/\//i.test(asset.sourceUrl)) errors.push(`${prefix}.sourceUrl must be an HTTPS provenance URL`);
  if (!isRecord(asset.rights) || asset.rights.reviewed !== true) errors.push(`${prefix}.rights.reviewed must be true after human review`);
  if (!isRecord(asset.rights) || !LICENSE_STATUSES.has(asset.rights.status)) errors.push(`${prefix}.rights.status must be an explicit license status`);
  if (!isRecord(asset.rights) || typeof asset.rights.license !== 'string' || !asset.rights.license.trim()) errors.push(`${prefix}.rights.license is required`);
  if (!isRecord(asset.rights) || typeof asset.rights.redistributionAllowed !== 'boolean') errors.push(`${prefix}.rights.redistributionAllowed must be explicit`);
  if (!isRecord(asset.rights) || typeof asset.rights.attribution !== 'string') errors.push(`${prefix}.rights.attribution must be present (use an empty string only when not required)`);
  if (asset.kind === 'model') {
    if (!isRecord(asset.model)) errors.push(`${prefix}.model metadata is required`);
    else {
      if (!MODEL_FORMATS.has(String(asset.model.format || '').toLowerCase())) errors.push(`${prefix}.model.format must be glb, gltf, fbx, or obj`);
      if (!['meters', 'centimeters', 'millimeters', 'unknown'].includes(asset.model.units)) errors.push(`${prefix}.model.units must be declared`);
      if (typeof asset.model.rigged !== 'boolean') errors.push(`${prefix}.model.rigged must be explicit`);
      if (typeof asset.model.animationCompatible !== 'boolean') errors.push(`${prefix}.model.animationCompatible must be explicit`);
      if (!Number.isInteger(asset.model.polyCount) || asset.model.polyCount < 0) errors.push(`${prefix}.model.polyCount must be a non-negative integer`);
    }
  }
  if (asset.kind === 'animation' && (!isRecord(asset.animation) || typeof asset.animation.skeleton !== 'string' || !asset.animation.skeleton.trim())) {
    errors.push(`${prefix}.animation.skeleton is required for compatibility review`);
  }
  return errors;
}

export function validateManifest(manifest, filename = '<manifest>') {
  const errors = [];
  const label = path.basename(filename);
  if (!isRecord(manifest)) return [`${label}: root must be an object`];
  if (manifest.schemaVersion !== 1) errors.push(`${label}: schemaVersion must be 1`);
  if (!SAFE_KEY.test(String(manifest.collectionKey || ''))) errors.push(`${label}: collectionKey must be a stable lowercase slug`);
  if (typeof manifest.collectionName !== 'string' || !manifest.collectionName.trim()) errors.push(`${label}: collectionName is required`);
  if (!isRecord(manifest.collectionIdentity)) errors.push(`${label}: collectionIdentity is required`);
  else {
    const identity = manifest.collectionIdentity;
    if (typeof identity.verified !== 'boolean') errors.push(`${label}: collectionIdentity.verified must be explicit`);
    if (identity.verified && (typeof identity.issuer !== 'string' || !identity.issuer.trim())) errors.push(`${label}: verified collection identity requires an issuer`);
    if (identity.taxon !== null && identity.taxon !== undefined && (!Number.isInteger(identity.taxon) || identity.taxon < 0)) errors.push(`${label}: taxon must be a non-negative integer or null`);
  }
  if (!Array.isArray(manifest.traitMappings)) errors.push(`${label}: traitMappings must be an array`);
  else {
    const seen = new Set();
    manifest.traitMappings.forEach((mapping, index) => {
      if (!isRecord(mapping)) { errors.push(`${label}: traitMappings[${index}] must be an object`); return; }
      if (typeof mapping.slot !== 'string' || !mapping.slot.trim()) errors.push(`${label}: traitMappings[${index}].slot is required`);
      if (!Array.isArray(mapping.aliases) || mapping.aliases.some(alias => typeof alias !== 'string' || !alias.trim())) errors.push(`${label}: traitMappings[${index}].aliases must be non-empty strings`);
      for (const alias of mapping.aliases || []) {
        const key = alias.trim().toLowerCase();
        if (seen.has(key)) errors.push(`${label}: duplicate trait alias "${alias}"`);
        seen.add(key);
      }
    });
  }
  if (!Array.isArray(manifest.assets)) errors.push(`${label}: assets must be an array (use [] until reviewed assets are approved)`);
  else manifest.assets.forEach((asset, index) => errors.push(...validateAsset(asset, index).map(error => `${label}: ${error}`)));
  if (!Array.isArray(manifest.qaSamples)) errors.push(`${label}: qaSamples must be an array`);
  else manifest.qaSamples.forEach((sample, index) => {
    if (!isRecord(sample) || typeof sample.tokenReference !== 'string' || !sample.tokenReference.trim()) errors.push(`${label}: qaSamples[${index}] needs a tokenReference or private review reference`);
    if (!isRecord(sample) || !Array.isArray(sample.coverage) || sample.coverage.length === 0) errors.push(`${label}: qaSamples[${index}] needs explicit trait/visual coverage`);
  });
  return errors;
}

async function validateFile(file) {
  let parsed;
  try {
    parsed = JSON.parse(await readFile(file, 'utf8'));
  } catch (error) {
    return { file, errors: [`${path.basename(file)}: invalid JSON (${error.message})`] };
  }
  const errors = validateManifest(parsed, file);
  if (parsed.collectionKey && path.basename(file, '.json') !== parsed.collectionKey) {
    errors.push(`${path.basename(file)}: filename must match collectionKey "${parsed.collectionKey}"`);
  }
  if (Array.isArray(parsed.assets)) {
    for (const asset of parsed.assets) {
      if (!safeRepoPath(asset?.path)) continue;
      try { await access(path.resolve(ROOT, asset.path)); }
      catch { errors.push(`${path.basename(file)}: asset path does not exist in checkout: ${asset.path}`); }
    }
  }
  return { file, errors, manifest: parsed };
}

async function main() {
  const [command = 'validate-all', target] = process.argv.slice(2);
  const files = command === 'validate'
    ? [path.resolve(process.cwd(), target || '')]
    : command === 'validate-all'
      ? (await readdir(COLLECTION_DIR)).filter(name => name.endsWith('.json')).sort().map(name => path.join(COLLECTION_DIR, name))
      : [];
  if (!files.length) {
    console.error('Usage: node scripts/nft-avatar-asset-pipeline.mjs validate-all | validate <manifest.json>');
    process.exitCode = 2;
    return;
  }
  let failed = false;
  for (const file of files) {
    const result = await validateFile(file);
    if (result.errors.length) {
      failed = true;
      for (const error of result.errors) console.error('FAIL ' + error);
    } else {
      const key = result.manifest.collectionKey;
      const assetCount = result.manifest.assets.length;
      console.log(`PASS ${key}: manifest valid; ${assetCount} reviewed asset record(s); ${result.manifest.qaSamples.length} QA sample(s)`);
      if (!result.manifest.collectionIdentity.verified) console.log(`NOTE ${key}: issuer/taxon identity is not verified; do not use this manifest as an ownership allowlist.`);
    }
  }
  if (failed) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
