#!/usr/bin/env node
/**
 * Resumable NFT reference catalog importer for RACC / 589 Protocol / Firekeepers.
 *
 * Uses the documented XRPL.to API for XRP.cafe-origin records. It deliberately
 * refuses to ingest a collection until its slug, issuer, taxon, and expected item
 * count are verified in nft-collection-ingest-plan.json.
 *
 * Usage:
 *   node scripts/ingest-nft-reference-catalog.mjs [--dry-run]
 *
 * Output: data/nft-reference-catalog/<collection-key>.json
 * Resume: rerun safely; pages are fetched deterministically and records deduped by
 * NFTokenID. API failures are written to the report and never treated as completeness.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeNftUri, safeUrl } from './nft-uri-utils.mjs';
import { validateIngestPlan } from './nft-ingest-plan-validator.mjs';
import { reconcileNftInventory } from './nft-inventory-reconciliation.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const configPath = path.join(root, 'client/js/nft-collection-ingest-plan.json');
const outputDir = path.join(root, 'data/nft-reference-catalog');
const API = 'https://api.xrpl.to/v1';
const PAGE_SIZE = 200;
const DELAY_MS = 350;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const argSet = new Set(process.argv.slice(2));
const dryRun = argSet.has('--dry-run');

function validTokenId(value) { return /^[0-9A-F]{64}$/i.test(String(value ?? '')); }
function parseNft(row, collectionKey) {
  const tokenId = String(row?.NFTokenID ?? row?._id ?? '').toUpperCase();
  const meta = row?.meta ?? {};
  const files = Array.isArray(row?.files) ? row.files : [];
  const attributes = Array.isArray(meta.attributes) ? meta.attributes : [];
  const props = Array.isArray(row?.props) ? row.props : [];
  const traits = attributes.length
    ? attributes.map(t => ({ type: String(t.trait_type ?? t.type ?? ''), value: String(t.value ?? '') }))
    : props.map(t => ({ type: String(t.type ?? ''), value: String(t.value ?? '') }));
  const image = safeUrl(meta.image) || safeUrl(files.find(f => /image/i.test(String(f?.parsedType ?? f?.type ?? '')))?.parsedUrl);
  return {
    collectionKey,
    tokenId,
    name: String(meta.name ?? row?.name ?? ''),
    collectionName: String(row?.collection ?? meta?.collection?.name ?? ''),
    issuer: String(row?.issuer ?? ''),
    taxon: Number.isInteger(Number(row?.taxon)) ? Number(row.taxon) : null,
    canonicalSourceUrl: validTokenId(tokenId) ? 'https://xrp.cafe/nft/' + tokenId : '',
    metadataUrl: safeUrl(row?.url) || safeUrl(decodeNftUri(row?.URI)),
    artworkUrl: image,
    rawTraits: traits,
    rawMeta: meta,
    origin: String(row?.origin ?? ''),
    license: String(meta.license ?? 'unspecified'),
    fetchedAt: new Date().toISOString(),
    status: validTokenId(tokenId) ? (image ? 'indexed' : 'missing-artwork') : 'invalid-token-id'
  };
}
async function fetchJson(url, attempts = 4) {
  let lastError;
  for (let i = 0; i < attempts; i++) {
    try {
      const response = await fetch(url, { headers: { accept: 'application/json', 'user-agent': 'BURN-City-NFT-Reference-Importer/1.0' }, signal: AbortSignal.timeout(20000) });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return await response.json();
    } catch (error) {
      lastError = error;
      if (i + 1 < attempts) await sleep(500 * (2 ** i) + Math.floor(Math.random() * 200));
    }
  }
  throw lastError;
}
async function main() {
  const config = JSON.parse(await readFile(configPath, 'utf8'));
  const plan = validateIngestPlan(config.collections);
  if (plan.errors.length) {
    console.error('Invalid NFT ingestion plan; no collection will be imported.');
    for (const error of plan.errors) console.error(JSON.stringify(error));
    process.exitCode = 2;
    return;
  }
  const configured = plan.configured;
  if (!configured.length) {
    console.error('No collection is enabled: verify slug, issuer, taxon and expectedCount in ' + path.relative(root, configPath));
    console.error('Discovery endpoint: ' + API + '/nft/collections?origin=xrp.cafe&limit=200&lightweight=true');
    process.exitCode = 2;
    return;
  }
  await mkdir(outputDir, { recursive: true });
  let hadErrors = false;
  for (const c of configured) {
    const records = new Map();
    const observedRows = [];
    const errors = [];
    let expected = c.expectedCount;
    console.log('Importing', c.displayName, 'from', c.slug, 'expected', expected);
    try {
      const detail = await fetchJson(API + '/nft/collections/' + encodeURIComponent(c.slug));
      const d = detail?.collection ?? detail;
      if (String(d?.issuer ?? d?.account ?? '') !== c.issuer || Number(d?.taxon) !== c.taxon) {
        throw new Error('Collection issuer/taxon mismatch; expected ' + c.issuer + ':' + c.taxon + ', got ' + String(d?.issuer ?? d?.account) + ':' + String(d?.taxon));
      }
      if (Number.isInteger(Number(d?.items)) && Number(d.items) !== expected) {
        errors.push({ code: 'EXPECTED_COUNT_CHANGED', configured: expected, api: Number(d.items) });
        expected = Number(d.items);
      }
      // Advance by the number actually returned, not the requested page size.
      // Some APIs cap page size below the requested limit; breaking on a short
      // non-empty page would silently leave the inventory incomplete.
      let offset = 0;
      while (offset < expected) {
        const url = new URL(API + '/nft');
        url.searchParams.set('issuer', c.issuer);
        url.searchParams.set('taxon', String(c.taxon));
        url.searchParams.set('offset', String(offset));
        url.searchParams.set('limit', String(PAGE_SIZE));
        let payload;
        try { payload = await fetchJson(url.toString()); }
        catch (error) { errors.push({ code: 'PAGE_FETCH_FAILED', offset, message: String(error.message ?? error) }); hadErrors = true; break; }
        const rows = Array.isArray(payload?.nfts) ? payload.nfts : [];
        if (!rows.length && offset < expected) {
          errors.push({ code: 'UNEXPECTED_EMPTY_PAGE', offset, expected });
          hadErrors = true; break;
        }
        for (const row of rows) {
          observedRows.push(row);
          const tokenId = String(row?.NFTokenID ?? row?._id ?? '').toUpperCase();
          if (String(row?.issuer ?? '') !== c.issuer || Number(row?.taxon) !== c.taxon) {
            errors.push({ code: 'TOKEN_IDENTITY_MISMATCH', tokenId, issuer: row?.issuer, taxon: row?.taxon });
            continue;
          }
          if (!validTokenId(tokenId)) { errors.push({ code: 'INVALID_TOKEN_ID', tokenId }); continue; }
          if (!records.has(tokenId)) records.set(tokenId, parseNft(row, c.key));
        }
        if (rows.length > 0) offset += rows.length;
        await sleep(DELAY_MS);
      }
    } catch (error) {
      errors.push({ code: 'COLLECTION_VALIDATION_FAILED', message: String(error.message ?? error) });
      hadErrors = true;
    }
    const reconciliation = reconcileNftInventory({
      candidate: { name: c.displayName, slug: c.slug, issuer: c.issuer, taxon: c.taxon, expectedCount: expected },
      verifiedIdentity: { slug: c.slug, issuer: c.issuer, taxon: c.taxon },
      expectedCount: expected,
      tokens: observedRows,
      pageErrors: errors
    });
    const inventoryComplete = errors.length === 0 && records.size === expected && reconciliation.inventoryComplete;
    if (!inventoryComplete) hadErrors = true;
    const report = {
      schemaVersion: 1, source: 'https://xrpl.to', sourceMarketplace: 'https://xrp.cafe',
      collection: { key: c.key, name: c.displayName, slug: c.slug, issuer: c.issuer, taxon: c.taxon },
      expectedCount: expected, observedUniqueCount: records.size, inventoryComplete,
      reconciliation,
      errors, records: [...records.values()].sort((a, b) => a.tokenId.localeCompare(b.tokenId)),
      attribution: 'NFT catalog data provided via documented XRPL.to API; link to https://xrpl.to wherever this data is displayed. Artwork rights/license remain subject to each NFT metadata and rights review.'
    };
    if (!dryRun) await writeFile(path.join(outputDir, c.key + '.json'), JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify({ collection: c.key, expected: expected, observed: records.size, inventoryComplete, errors: errors.length, missingArtwork: report.records.filter(r => !r.artworkUrl).length, output: dryRun ? 'dry-run' : path.relative(root, path.join(outputDir, c.key + '.json')) }));
  }
  if (hadErrors) process.exitCode = 1;
}
main().catch(error => { console.error(error); process.exitCode = 1; });
