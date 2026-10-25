/**
 * Fail-closed validator for NFT collection identity evidence.
 *
 * This validates a review record's completeness, not the truth of its claims.
 * Evidence must be collected from authoritative XRPL/marketplace responses and
 * independently reviewed before ingestion is enabled.
 */
const text = value => String(value ?? '').trim();
const TOKEN_ID = /^[0-9A-Fa-f]{64}$/;
const CLASSIC_ADDRESS = /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/;

export function validateCollectionIdentityEvidence(record = {}) {
  const errors = [];
  const requireValue = (condition, code, message) => { if (!condition) errors.push({ code, message }); };

  requireValue(text(record.collectionKey), 'MISSING_COLLECTION_KEY', 'collectionKey is required');
  requireValue(text(record.canonicalName), 'MISSING_CANONICAL_NAME', 'canonicalName is required');
  requireValue(/^https?:\/\//i.test(text(record.marketplaceUrl)), 'INVALID_MARKETPLACE_URL', 'marketplaceUrl must be an HTTP(S) URL');
  requireValue(text(record.apiSlug), 'MISSING_API_SLUG', 'apiSlug is required');
  requireValue(CLASSIC_ADDRESS.test(text(record.issuer)), 'INVALID_ISSUER', 'issuer must look like an XRPL classic address');
  requireValue(Number.isInteger(record.taxon) && record.taxon >= 0, 'INVALID_TAXON', 'taxon must be a non-negative integer');
  requireValue(Number.isInteger(record.expectedCount) && record.expectedCount > 0, 'INVALID_EXPECTED_COUNT', 'expectedCount must be a positive integer');
  requireValue(/^\d{4}-\d{2}-\d{2}T/.test(text(record.retrievedAt)) && Number.isFinite(Date.parse(record.retrievedAt)), 'INVALID_RETRIEVAL_TIME', 'retrievedAt must be an ISO-like timestamp');
  requireValue(/^https?:\/\//i.test(text(record.inventoryEvidenceUrl)), 'MISSING_INVENTORY_EVIDENCE', 'inventoryEvidenceUrl must identify the source inventory response');
  requireValue(/^https?:\/\//i.test(text(record.collectionEvidenceUrl)), 'MISSING_COLLECTION_EVIDENCE', 'collectionEvidenceUrl must identify the source collection response');
  requireValue(text(record.reviewer), 'MISSING_REVIEWER', 'reviewer is required');
  requireValue(text(record.secondReviewer) && text(record.secondReviewer) !== text(record.reviewer), 'MISSING_INDEPENDENT_REVIEW', 'a distinct second reviewer is required');

  const samples = Array.isArray(record.sampleTokens) ? record.sampleTokens : [];
  const validSamples = samples.filter(sample =>
    sample && TOKEN_ID.test(text(sample.tokenId)) &&
    text(sample.issuer) === text(record.issuer) &&
    Number.isInteger(sample.taxon) && sample.taxon === record.taxon
  );
  const uniqueSampleIds = new Set(validSamples.map(sample => text(sample.tokenId).toUpperCase()));
  requireValue(uniqueSampleIds.size >= 2, 'INSUFFICIENT_VERIFIED_SAMPLES', 'at least two distinct sample token IDs must match the expected issuer and taxon');

  const observed = record.observedUniqueCount;
  requireValue(Number.isInteger(observed) && observed >= 0, 'INVALID_OBSERVED_COUNT', 'observedUniqueCount must be a non-negative integer');
  requireValue(Number.isInteger(observed) && Number.isInteger(record.expectedCount) && observed === record.expectedCount,
    'INVENTORY_COUNT_MISMATCH', 'observed unique inventory count must match expectedCount');

  return Object.freeze({
    collectionKey: text(record.collectionKey),
    valid: errors.length === 0,
    errors: Object.freeze(errors),
    note: 'Completeness checks do not independently authenticate the evidence or approve artwork rights.'
  });
}
