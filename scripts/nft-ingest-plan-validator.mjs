const IDENTITY_FIELDS = ['slug', 'issuer', 'taxon', 'expectedCount'];

export function validateIngestPlan(collections) {
  const errors = [];
  const configured = [];
  const keys = new Set();
  const slugs = new Set();
  const identities = new Set();

  if (!Array.isArray(collections)) {
    return { configured, errors: [{ code: 'INVALID_COLLECTIONS_LIST' }] };
  }

  for (const [index, collection] of collections.entries()) {
    const c = collection && typeof collection === 'object' ? collection : {};
    const key = String(c.key ?? '').trim();
    const present = IDENTITY_FIELDS.filter(field => c[field] !== null && c[field] !== undefined && c[field] !== '');
    if (keys.has(key) || !key) errors.push({ code: 'INVALID_OR_DUPLICATE_COLLECTION_KEY', index, key });
    if (key) keys.add(key);

    // Entirely unset identities are intentional placeholders. Partially filled
    // tuples are configuration mistakes and must never be silently skipped.
    if (present.length === 0) continue;
    if (present.length !== IDENTITY_FIELDS.length) {
      errors.push({ code: 'PARTIAL_COLLECTION_IDENTITY', index, key, missing: IDENTITY_FIELDS.filter(f => !present.includes(f)) });
      continue;
    }

    const slug = String(c.slug).trim();
    const issuer = String(c.issuer).trim();
    const taxon = c.taxon;
    const expectedCount = c.expectedCount;
    if (!/^[a-z0-9][a-z0-9-]*$/i.test(slug)) errors.push({ code: 'INVALID_COLLECTION_SLUG', index, key, slug });
    if (!/^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(issuer)) errors.push({ code: 'INVALID_CLASSIC_ISSUER_FORMAT', index, key });
    if (!Number.isInteger(taxon) || taxon < 0) errors.push({ code: 'INVALID_TAXON', index, key });
    if (!Number.isInteger(expectedCount) || expectedCount < 1) errors.push({ code: 'INVALID_EXPECTED_COUNT', index, key });

    if (slugs.has(slug)) errors.push({ code: 'DUPLICATE_COLLECTION_SLUG', index, key, slug });
    slugs.add(slug);
    const identity = issuer + ':' + taxon;
    if (identities.has(identity)) errors.push({ code: 'DUPLICATE_ISSUER_TAXON', index, key, identity });
    identities.add(identity);

    if (!errors.some(e => e.index === index)) configured.push(c);
  }
  return { configured, errors };
}
