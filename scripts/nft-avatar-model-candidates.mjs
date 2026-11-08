#!/usr/bin/env node
/**
 * Validate the research-only open model candidate catalog.
 * This is deliberately separate from the production asset intake pipeline.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CATALOG = path.join(ROOT, 'assets', 'nft-avatars', 'model-candidates.json');
const COLLECTIONS = new Set(['racc', '589', 'fk', 'shared-technical']);
const RIGHTS = new Set(['pending-review', 'not-assessed', 'approved', 'rejected']);
const VISUAL = new Set(['not-reviewed', 'pending-review', 'approved', 'rejected']);
const TECHNICAL = new Set(['not-tested', 'pending-review', 'passed', 'failed']);

export function validateCandidateCatalog(catalog) {
  const errors = [];
  if (!catalog || typeof catalog !== 'object' || Array.isArray(catalog)) return ['catalog must be an object'];
  if (catalog.schemaVersion !== 1) errors.push('schemaVersion must be 1');
  if (catalog.status !== 'research-only') errors.push('status must remain research-only');
  if (!Array.isArray(catalog.candidates)) return [...errors, 'candidates must be an array'];
  const ids = new Set();
  for (const [i, item] of catalog.candidates.entries()) {
    const p = 'candidates[' + i + ']';
    if (!item || typeof item !== 'object' || Array.isArray(item)) { errors.push(p + ' must be an object'); continue; }
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item.id || '')) errors.push(p + '.id must be a stable slug');
    if (ids.has(item.id)) errors.push(p + '.id must be unique');
    ids.add(item.id);
    if (!COLLECTIONS.has(item.intendedCollection)) errors.push(p + '.intendedCollection is unsupported');
    if (item.intendedCollection === 'racc' && item.id !== 'racc-creature-base' && !item.notes?.includes('RACC')) {
      errors.push(p + ' must explain explicit RACC compatibility');
    }
    if (item.sourceUrl && !/^https:\/\//i.test(item.sourceUrl)) errors.push(p + '.sourceUrl must be HTTPS or empty while unselected');
    if (!item.sourceUrl && item.intendedCollection !== 'racc') errors.push(p + '.sourceUrl is required for sourced candidates');
    if (!Array.isArray(item.formats) || item.formats.some(format => typeof format !== 'string')) errors.push(p + '.formats must be an array of strings');
    if (typeof item.reportedLicense !== 'string' || !item.reportedLicense.trim()) errors.push(p + '.reportedLicense is required');
    if (!RIGHTS.has(item.rightsStatus)) errors.push(p + '.rightsStatus is unsupported');
    if (!VISUAL.has(item.visualStatus)) errors.push(p + '.visualStatus is unsupported');
    if (!TECHNICAL.has(item.technicalStatus)) errors.push(p + '.technicalStatus is unsupported');
    if (item.rightsStatus === 'approved' && (!item.sourceUrl || item.visualStatus !== 'approved' || item.technicalStatus !== 'passed')) {
      errors.push(p + ' cannot be rights-approved without source provenance, visual approval, and technical pass');
    }
  }
  return errors;
}

async function main() {
  const catalog = JSON.parse(await readFile(CATALOG, 'utf8'));
  const errors = validateCandidateCatalog(catalog);
  if (errors.length) {
    for (const error of errors) console.error('FAIL ' + error);
    process.exitCode = 1;
    return;
  }
  console.log('NFT avatar model candidate catalog: ' + catalog.candidates.length + ' research candidates valid');
  console.log('NOTE: catalog validation does not download models or approve rights, visual likeness, or technical compatibility.');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
