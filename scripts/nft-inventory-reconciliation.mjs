/**
 * Deterministic reconciliation for discovered NFT collection candidates and token inventory.
 * Read-only diagnostics only: never approves a collection or enables ingestion.
 */
const list = value => Array.isArray(value) ? value : [];
const text = value => String(value ?? '').trim();
const tokenIdOf = row => text(row?.NFTokenID ?? row?.tokenId ?? row?._id).toUpperCase();

export function reconcileNftInventory({
  candidate = {},
  verifiedIdentity = null,
  expectedCount = candidate.expectedCount,
  tokens = [],
  pageErrors = []
} = {}) {
  const rows = list(tokens);
  const issues = list(pageErrors).map(error => ({ ...error }));
  const counts = new Map();
  const validRows = [];
  let invalidTokenIds = 0;
  let missingArtwork = 0;
  let missingMetadata = 0;
  let missingTraits = 0;
  let issuerMismatches = 0;
  let taxonMismatches = 0;

  const expectedIssuer = text(verifiedIdentity?.issuer);
  const expectedTaxon = Number.isInteger(verifiedIdentity?.taxon) ? verifiedIdentity.taxon : null;
  const identityVerified = Boolean(expectedIssuer && expectedTaxon !== null && text(verifiedIdentity?.slug));

  for (const row of rows) {
    const tokenId = tokenIdOf(row);
    if (!/^[0-9A-F]{64}$/.test(tokenId)) {
      invalidTokenIds++;
      issues.push({ code: 'INVALID_TOKEN_ID', tokenId });
    } else {
      counts.set(tokenId, (counts.get(tokenId) || 0) + 1);
      validRows.push(row);
    }

    const issuer = text(row?.issuer);
    const taxon = Number.isInteger(Number(row?.taxon)) ? Number(row.taxon) : null;
    if (expectedIssuer && issuer !== expectedIssuer) {
      issuerMismatches++;
      issues.push({ code: 'ISSUER_MISMATCH', tokenId, expected: expectedIssuer, observed: issuer || null });
    }
    if (expectedTaxon !== null && taxon !== expectedTaxon) {
      taxonMismatches++;
      issues.push({ code: 'TAXON_MISMATCH', tokenId, expected: expectedTaxon, observed: taxon });
    }

    const metadata = row?.meta ?? row?.metadata ?? null;
    const artwork = row?.artworkUrl ?? row?.image ?? metadata?.image ?? row?.files?.find?.(f => /image/i.test(String(f?.type ?? f?.parsedType ?? '')))?.parsedUrl;
    const traits = Array.isArray(row?.rawTraits) ? row.rawTraits : Array.isArray(metadata?.attributes) ? metadata.attributes : Array.isArray(row?.props) ? row.props : [];
    if (!text(artwork)) missingArtwork++;
    if (!metadata && !text(row?.metadataUrl ?? row?.URI ?? row?.url)) missingMetadata++;
    if (!traits.length) missingTraits++;
  }

  const duplicates = [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([tokenId, count]) => ({ tokenId, count }))
    .sort((a, b) => a.tokenId.localeCompare(b.tokenId));
  for (const duplicate of duplicates) issues.push({ code: 'DUPLICATE_TOKEN_ID', ...duplicate });

  const observedUniqueCount = counts.size;
  const expected = Number.isInteger(expectedCount) && expectedCount >= 0 ? expectedCount : null;
  const countMismatch = expected !== null && expected !== observedUniqueCount;
  if (countMismatch) issues.push({ code: 'INVENTORY_COUNT_MISMATCH', expected, observed: observedUniqueCount });

  const pageErrorsPresent = list(pageErrors).length > 0;
  const inventoryComplete = identityVerified && expected !== null &&
    observedUniqueCount === expected && invalidTokenIds === 0 &&
    duplicates.length === 0 && issuerMismatches === 0 && taxonMismatches === 0 &&
    !pageErrorsPresent;

  return Object.freeze({
    mode: 'diagnostic-only',
    approved: false,
    ingestionEnabled: false,
    candidate: {
      name: text(candidate.name),
      slug: text(candidate.slug),
      issuer: text(candidate.issuer) || null,
      taxon: Number.isInteger(candidate.taxon) ? candidate.taxon : null
    },
    identityVerified,
    expectedCount: expected,
    observedRows: rows.length,
    observedUniqueCount,
    invalidTokenIds,
    duplicateTokenIds: duplicates,
    issuerMismatches,
    taxonMismatches,
    missingArtwork,
    missingMetadata,
    missingTraits,
    pageErrors: list(pageErrors),
    inventoryComplete,
    issues
  });
}
