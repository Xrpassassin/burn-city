#!/usr/bin/env node
/**
 * Connect discovery candidates to read-only inventory reconciliation.
 * This tool NEVER edits the ingest plan, approves identities, or enables imports.
 *
 * Usage: node scripts/reconcile-nft-discovery.mjs [--dry-run]
 */
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeName, scoreCandidate, normalizeCandidate } from './discover-nft-collections.mjs';
import { reconcileNftInventory } from './nft-inventory-reconciliation.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const API = 'https://api.xrpl.to/v1';
const OUTPUT = path.join(ROOT, 'data/nft-discovery-reconciliation.json');
const TARGETS = [
  { key: 'racc', label: 'RACC', terms: ['racc', 'racc guy', 'raccem willy'] },
  { key: '589', label: '589 Protocol', terms: ['589 protocol', '589'] },
  { key: 'firekeepers', label: 'Firekeepers', terms: ['firekeepers', 'fire keeper'] }
];
const dryRun = process.argv.slice(2).includes('--dry-run');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function fetchJson(url, attempts = 3) {
  let last;
  for (let i = 0; i < attempts; i++) {
    try {
      const response = await fetch(url, {
        headers: { accept: 'application/json', 'user-agent': 'BURN-City-NFT-Discovery-Reconciliation/1.0' },
        signal: AbortSignal.timeout(20000)
      });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return await response.json();
    } catch (error) {
      last = error;
      if (i + 1 < attempts) await sleep(400 * (2 ** i));
    }
  }
  throw last;
}
function unwrapRows(payload) {
  if (Array.isArray(payload)) return payload;
  for (const key of ['collections', 'data', 'results', 'items']) {
    if (Array.isArray(payload?.[key])) return payload[key];
  }
  if (Array.isArray(payload?.collections?.data)) return payload.collections.data;
  return null;
}
function selectCandidates(rows, target) {
  const terms = target.terms.map(normalizeName);
  return rows.map(raw => {
    const normalized = normalizeCandidate(raw);
    const score = Math.max(...terms.map(term => scoreCandidate(raw, [term])));
    return { raw, normalized, score };
  }).filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score || a.normalized.name.localeCompare(b.normalized.name));
}
async function inspectCandidate(item) {
  const c = item.normalized;
  const result = {
    name: c.name, slug: c.slug, issuer: c.issuer || null, taxon: c.taxon,
    expectedCount: c.expectedCount, matchScore: item.score,
    candidateSource: c.source, marketplaceUrl: c.marketplaceUrl || null,
    identityStatus: 'candidate-unverified', inventory: null,
    warnings: []
  };
  if (!c.slug || !c.issuer || c.taxon === null || c.expectedCount === null) {
    result.warnings.push('Candidate lacks slug, issuer, taxon, or expected count; inventory query skipped.');
    return result;
  }
  const errors = [];
  let detail;
  try {
    detail = await fetchJson(API + '/nft/collections/' + encodeURIComponent(c.slug));
  } catch (error) {
    errors.push({ code: 'COLLECTION_DETAIL_FETCH_FAILED', message: String(error?.message ?? error) });
  }
  const d = detail?.collection ?? detail;
  const detailIssuer = String(d?.issuer ?? d?.account ?? '');
  const detailTaxon = Number.isInteger(Number(d?.taxon)) ? Number(d.taxon) : null;
  const detailMatches = Boolean(detail && detailIssuer === c.issuer && detailTaxon === c.taxon);
  if (detail && !detailMatches) {
    errors.push({ code: 'DISCOVERY_DETAIL_MISMATCH', candidateIssuer: c.issuer, detailIssuer: detailIssuer || null, candidateTaxon: c.taxon, detailTaxon });
  }
  const expected = c.expectedCount;
  const rows = [];
  let offset = 0;
  const pageSize = 200;
  let stop = false;
  while (!stop && offset < expected) {
    const url = new URL(API + '/nft');
    url.searchParams.set('issuer', c.issuer);
    url.searchParams.set('taxon', String(c.taxon));
    url.searchParams.set('offset', String(offset));
    url.searchParams.set('limit', String(pageSize));
    let payload;
    try { payload = await fetchJson(url.toString()); }
    catch (error) {
      errors.push({ code: 'PAGE_FETCH_FAILED', offset, message: String(error?.message ?? error) });
      break;
    }
    const page = Array.isArray(payload?.nfts) ? payload.nfts : [];
    if (!page.length) {
      errors.push({ code: 'UNEXPECTED_EMPTY_PAGE', offset, expected });
      break;
    }
    rows.push(...page);
    offset += page.length;
    if (offset < expected) await sleep(250);
    // A hard safety ceiling prevents a malformed API from creating an unbounded scan.
    if (rows.length > Math.max(expected * 2, expected + 2000)) {
      errors.push({ code: 'SAFETY_ROW_LIMIT_EXCEEDED', rows: rows.length });
      stop = true;
    }
  }
  const reconciliation = reconcileNftInventory({
    candidate: c,
    // Discovery candidates are never treated as human-verified identities.
    // expectedIdentity enables mismatch diagnostics without satisfying the verification gate.
    expectedIdentity: detailMatches ? { slug: c.slug, issuer: c.issuer, taxon: c.taxon } : null,
    expectedCount: expected,
    tokens: rows,
    pageErrors: errors
  });
  result.inventory = {
    detailEndpointMatchedCandidate: detailMatches,
    detail: detail ? { issuer: detailIssuer || null, taxon: detailTaxon, itemCount: Number.isInteger(Number(d?.items)) ? Number(d.items) : null } : null,
    reconciliation,
    warning: 'Mechanical consistency is not independent identity verification. Confirm canonical marketplace page and sample NFTokenIDs before approving the collection.'
  };
  if (!detailMatches) result.warnings.push('Collection detail endpoint did not independently match the discovery issuer/taxon.');
  if (c.expectedCount !== reconciliation.observedUniqueCount) result.warnings.push('Discovered expected count differs from observed unique token IDs.');
  return result;
}

async function main() {
  const discoveryUrl = API + '/nft/collections?origin=xrp.cafe&limit=200&lightweight=true';
  const payload = await fetchJson(discoveryUrl);
  const rows = unwrapRows(payload);
  if (!rows) throw new Error('DISCOVERY_RESPONSE_SHAPE_UNKNOWN');
  const targets = [];
  for (const target of TARGETS) {
    const candidates = selectCandidates(rows, target);
    // Include the top candidate and exact/high-confidence matches, without pretending that a name match verifies identity.
    const chosen = candidates.filter(item => item.score >= 70).slice(0, 10);
    targets.push({
      key: target.key, label: target.label,
      matchCount: candidates.length,
      candidates: await Promise.all(chosen.map(inspectCandidate))
    });
  }
  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    mode: 'read-only-discovery-inventory-reconciliation',
    approved: false,
    ingestionEnabled: false,
    configChanged: false,
    discoverySource: discoveryUrl,
    targets,
    note: 'Name/slug matching identifies candidates only. Mechanical issuer/taxon/count consistency does not replace independent marketplace identity verification or rights review.'
  };
  if (!dryRun) {
    await mkdir(path.dirname(OUTPUT), { recursive: true });
    await writeFile(OUTPUT, JSON.stringify(report, null, 2) + '\n');
  }
  console.log(JSON.stringify({
    mode: report.mode, approved: false, ingestionEnabled: false,
    output: dryRun ? 'dry-run (no file written)' : path.relative(ROOT, OUTPUT),
    targets: targets.map(target => ({
      key: target.key, matchCount: target.matchCount,
      inspectedCandidates: target.candidates.length,
      inventoryReports: target.candidates.filter(c => c.inventory).length
    }))
  }, null, 2));
}
main().catch(error => {
  console.error(JSON.stringify({ error: 'DISCOVERY_RECONCILIATION_FAILED', message: String(error?.message ?? error) }, null, 2));
  process.exitCode = 1;
});
