#!/usr/bin/env node
/**
 * Read-only NFT collection discovery. Produces candidates for human review and
 * never writes to nft-collection-ingest-plan.json or enables ingestion.
 *
 * Usage: node scripts/discover-nft-collections.mjs [racc] [589 protocol] [firekeepers]
 */
import { validateIngestPlan } from './nft-ingest-plan-validator.mjs';

const API = 'https://api.xrpl.to/v1';
const DEFAULT_TERMS = ['racc', '589 protocol', 'firekeepers'];
const args = process.argv.slice(2).map(s => s.trim()).filter(Boolean);
const terms = (args.length ? args : DEFAULT_TERMS).map(normalizeName);

export function normalizeName(value) {
  return String(value ?? '').normalize('NFKC').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function unwrapRows(payload) {
  if (Array.isArray(payload)) return payload;
  for (const key of ['collections', 'data', 'results', 'items']) {
    if (Array.isArray(payload?.[key])) return payload[key];
  }
  if (Array.isArray(payload?.collections?.data)) return payload.collections.data;
  return null;
}

export function scoreCandidate(collection, terms = DEFAULT_TERMS) {
  const name = normalizeName(collection?.name ?? collection?.collection ?? collection?.displayName);
  const slug = normalizeName(collection?.slug ?? collection?.id);
  const haystack = [name, slug].filter(Boolean).join(' ');
  return Math.max(0, ...terms.map(term => {
    const normalized = normalizeName(term);
    if (!normalized) return 0;
    if (name === normalized || slug === normalized) return 100;
    if (name.includes(normalized) || slug.includes(normalized)) return 70;
    const words = normalized.split(' ');
    return words.length > 1 && words.every(word => haystack.includes(word)) ? 45 : 0;
  }));
}

export function normalizeCandidate(collection) {
  const issuer = String(collection?.issuer ?? collection?.account ?? collection?.owner ?? '');
  const taxonValue = collection?.taxon;
  const countValue = collection?.items ?? collection?.count ?? collection?.nfts;
  const count = typeof countValue === 'number' ? countValue : Number(countValue);
  return {
    name: String(collection?.name ?? collection?.collection ?? collection?.displayName ?? ''),
    slug: String(collection?.slug ?? collection?.id ?? ''),
    issuer,
    taxon: Number.isInteger(Number(taxonValue)) && taxonValue !== null && taxonValue !== '' ? Number(taxonValue) : null,
    expectedCount: Number.isInteger(count) && count >= 0 ? count : null,
    marketplaceUrl: String(collection?.url ?? collection?.link ?? ''),
    source: API + '/nft/collections?origin=xrp.cafe&limit=200&lightweight=true',
    identityReadyForReview: Boolean(collection?.slug && issuer && taxonValue !== undefined && taxonValue !== null && countValue !== undefined)
  };
}

async function main() {
  const url = API + '/nft/collections?origin=xrp.cafe&limit=200&lightweight=true';
  let response;
  try {
    response = await fetch(url, {
      headers: { accept: 'application/json', 'user-agent': 'BURN-City-NFT-Collection-Discovery/1.0' },
      signal: AbortSignal.timeout(20000)
    });
  } catch (error) {
    console.error(JSON.stringify({ error: 'DISCOVERY_REQUEST_FAILED', message: String(error?.message ?? error), url }, null, 2));
    process.exitCode = 1;
    return;
  }
  if (!response.ok) {
    console.error(JSON.stringify({ error: 'DISCOVERY_HTTP_ERROR', status: response.status, url }, null, 2));
    process.exitCode = 1;
    return;
  }
  let payload;
  try { payload = await response.json(); }
  catch {
    console.error(JSON.stringify({ error: 'DISCOVERY_INVALID_JSON', url }, null, 2));
    process.exitCode = 1;
    return;
  }
  const rows = unwrapRows(payload);
  if (!rows) {
    console.error(JSON.stringify({ error: 'DISCOVERY_RESPONSE_SHAPE_UNKNOWN', topLevelKeys: Object.keys(payload ?? {}), url }, null, 2));
    process.exitCode = 1;
    return;
  }
  const candidates = rows
    .map(row => ({ ...normalizeCandidate(row), matchScore: scoreCandidate(row, terms) }))
    .filter(row => row.matchScore > 0)
    .sort((a, b) => b.matchScore - a.matchScore || a.name.localeCompare(b.name));
  const configValidation = validateIngestPlan([]);
  console.log(JSON.stringify({
    mode: 'read-only-candidates',
    approved: false,
    configChanged: false,
    ingestionEnabled: false,
    requestedTerms: terms,
    returnedCollectionCount: rows.length,
    candidateCount: candidates.length,
    candidates,
    note: 'Candidates are leads only. Verify the canonical marketplace page, issuer, taxon, count, and sample NFTokenIDs independently before editing the ingest plan.',
    validatorSelfCheck: configValidation.errors.length === 0
  }, null, 2));
}

if (import.meta.url === new URL(process.argv[1], 'file:').href) {
  main().catch(error => {
    console.error(JSON.stringify({ error: 'UNEXPECTED_DISCOVERY_FAILURE', message: String(error?.message ?? error) }, null, 2));
    process.exitCode = 1;
  });
}
