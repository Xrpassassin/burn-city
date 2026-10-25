/**
 * Reusable NFT trait-asset registry foundation.
 * Separates source metadata from game visuals. No remote fetching or ledger mutation.
 */
const text = value => String(value ?? '').normalize('NFKC').trim();
const list = value => Array.isArray(value) ? value : [];

export function canonicalTraitKey({ collection, type, value, variant = 'default' } = {}) {
  const parts = [collection, type, value, variant].map(v => text(v).toLocaleLowerCase('en-US'));
  if (parts.some(v => !v)) throw new TypeError('collection, type, value, and variant are required');
  return parts.map(v => encodeURIComponent(v)).join('::');
}

export function safeHttpUrl(value) {
  const raw = text(value);
  if (!raw) return '';
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : '';
  } catch { return ''; }
}
export function safeSourceUrl(value) {
  const raw = text(value);
  if (!raw) return '';
  if (/^ipfs:\/\//i.test(raw)) return raw;
  return safeHttpUrl(raw);
}
export function resolveSourceUrl(value, ipfsGateway = '') {
  const raw = safeSourceUrl(value);
  if (!/^ipfs:\/\//i.test(raw)) return raw;
  const gateway = safeHttpUrl(ipfsGateway);
  if (!gateway) return '';
  const path = raw.slice('ipfs://'.length).replace(/^ipfs\//, '');
  return gateway.replace(/\/$/, '') + '/ipfs/' + path.split('/').map(encodeURIComponent).join('/');
}
export function normalizeTraitSource(record = {}) {
  const collection = text(record.collection);
  const tokenId = text(record.tokenId ?? record.NFTokenID).toUpperCase();
  const type = text(record.type ?? record.trait_type ?? record.traitType);
  const value = text(record.value);
  if (!collection || !tokenId || !/^[0-9A-F]{64}$/.test(tokenId) || !type || !value) {
    throw new TypeError('trait source requires collection, 64-hex tokenId, type, and value');
  }
  return Object.freeze({
    collection, tokenId, type, value,
    sourceUrl: safeHttpUrl(record.sourceUrl),
    metadataUrl: safeSourceUrl(record.metadataUrl),
    artworkUrl: safeSourceUrl(record.artworkUrl),
    provenance: text(record.provenance) || 'unspecified',
    original: record.original ?? { type: record.type ?? record.trait_type ?? record.traitType, value: record.value }
  });
}

/** Build a deterministic canonical catalog and an index of NFTs that evidence each trait. */
export function createTraitAssetRegistry({ allowedCollections = [], assets = [], sources = [] } = {}) {
  const allowed = new Set(list(allowedCollections).map(v => text(v).toLowerCase()).filter(Boolean));
  const byKey = new Map(), sourceIndex = new Map(), issues = [];
  for (const raw of list(assets)) {
    const collection = text(raw.collection).toLowerCase(), type = text(raw.type), value = text(raw.value);
    const variant = text(raw.variant || 'default');
    if (!collection || !type || !value || !allowed.has(collection)) {
      issues.push({ code: 'INVALID_OR_UNAPPROVED_ASSET', traitId: raw.id ?? '', collection }); continue;
    }
    const key = canonicalTraitKey({ collection, type, value, variant });
    const asset = Object.freeze({
      id: text(raw.id) || key, key, collection, type, value, variant,
      slot: text(raw.slot).toLowerCase(),
      rigFamilies: list(raw.rigFamilies).map(v => text(v).toLowerCase()).filter(Boolean),
      modelRef: text(raw.modelRef), materialRef: text(raw.materialRef),
      textureRefs: list(raw.textureRefs).map(text).filter(Boolean),
      sourceTokenIds: [...new Set(list(raw.sourceTokenIds).map(v => text(v).toUpperCase()).filter(v => /^[0-9A-F]{64}$/.test(v)))],
      sourceArtworkUrls: [...new Set(list(raw.sourceArtworkUrls).map(safeSourceUrl).filter(Boolean))],
      compatibility: list(raw.compatibility).map(v => text(v).toLowerCase()).filter(Boolean),
      provenance: text(raw.provenance) || 'unspecified',
      rightsStatus: text(raw.rightsStatus) || 'unverified',
      visualApproval: ['approved', 'rejected', 'needs-review'].includes(raw.visualApproval) ? raw.visualApproval : 'not-reviewed',
      version: Number.isInteger(raw.version) && raw.version > 0 ? raw.version : 1
    });
    if (byKey.has(key)) { issues.push({ code: 'DUPLICATE_CANONICAL_TRAIT', key, firstId: byKey.get(key).id, duplicateId: asset.id }); continue; }
    byKey.set(key, asset);
  }
  for (const raw of list(sources)) {
    try {
      const source = normalizeTraitSource(raw);
      if (!allowed.has(source.collection.toLowerCase())) {
        issues.push({ code: 'UNAPPROVED_SOURCE_COLLECTION', tokenId: source.tokenId, collection: source.collection }); continue;
      }
      const key = canonicalTraitKey({ collection: source.collection, type: source.type, value: source.value });
      const rows = sourceIndex.get(key) || [];
      if (!rows.some(row => row.tokenId === source.tokenId)) rows.push(source);
      sourceIndex.set(key, rows);
    } catch (error) { issues.push({ code: 'INVALID_TRAIT_SOURCE', message: error.message, tokenId: text(raw.tokenId ?? raw.NFTokenID) }); }
  }
  return Object.freeze({
    assets: byKey, sources: sourceIndex, issues: Object.freeze(issues),
    get({ collection, type, value, variant = 'default' } = {}) {
      return byKey.get(canonicalTraitKey({ collection, type, value, variant })) ?? null;
    },
    getSources({ collection, type, value, variant = 'default' } = {}) {
      return [...(sourceIndex.get(canonicalTraitKey({ collection, type, value, variant })) || [])];
    },
    findById(id) { return [...byKey.values()].find(asset => asset.id === text(id)) ?? null; },
    list({ collection, slot, visualApproval } = {}) {
      return [...byKey.values()].filter(asset =>
        (!collection || asset.collection === text(collection).toLowerCase()) &&
        (!slot || asset.slot === text(slot).toLowerCase()) &&
        (!visualApproval || asset.visualApproval === visualApproval));
    }
  });
}

/** Fail-closed checks for equipping a reviewed trait asset on a character. */
export function canEquipTrait(asset, character = {}) {
  if (!asset) return { ok: false, reason: 'trait-asset-not-found' };
  if (asset.visualApproval !== 'approved') return { ok: false, reason: 'trait-visual-not-approved' };
  if (asset.rightsStatus !== 'approved') return { ok: false, reason: 'trait-rights-not-approved' };
  const assetCollection = text(asset.collection).toLowerCase();
  const characterCollection = text(character.collection).toLowerCase();
  if (!assetCollection || !characterCollection || assetCollection !== characterCollection) return { ok: false, reason: 'collection-mismatch' };
  const rig = text(character.rigFamily).toLowerCase();
  if (asset.rigFamilies.length && (!rig || !asset.rigFamilies.includes(rig))) return { ok: false, reason: 'incompatible-rig' };
  const slots = list(character.supportedSlots).map(v => text(v).toLowerCase());
  if (asset.slot && !slots.includes(asset.slot)) return { ok: false, reason: 'unsupported-slot' };
  const collection = text(character.collection).toLowerCase();
  if (asset.compatibility.length && !asset.compatibility.includes(collection)) return { ok: false, reason: 'collection-not-compatible' };
  return { ok: true, reason: 'compatible' };
}

/** Inventory is complete only when unique valid IDs reconcile to an expected count with no page errors. */
export function validateCollectionInventory({ collection, expectedCount, tokens = [], pageErrors = [] } = {}) {
  const ids = list(tokens).map(token => text(token.NFTokenID ?? token.tokenId).toUpperCase());
  const validIds = ids.filter(id => /^[0-9A-F]{64}$/.test(id));
  const unique = new Set(validIds), errors = [...list(pageErrors)];
  if (validIds.length !== ids.length) errors.push({ code: 'INVALID_TOKEN_ID_COUNT', observed: ids.length - validIds.length });
  if (unique.size !== validIds.length) errors.push({ code: 'DUPLICATE_TOKEN_IDS', duplicates: validIds.length - unique.size });
  if (Number.isInteger(expectedCount) && expectedCount !== unique.size) errors.push({ code: 'INVENTORY_COUNT_MISMATCH', expected: expectedCount, observed: unique.size });
  return Object.freeze({ collection: text(collection), expectedCount: Number.isInteger(expectedCount) ? expectedCount : null, observedCount: unique.size, complete: errors.length === 0 && Number.isInteger(expectedCount), errors: Object.freeze(errors) });
}

/** Resolve each source trait only against its own collection's canonical asset key.
 * Missing/unreviewed/incompatible traits stay visible in the manifest for QA; they are never
 * silently borrowed from another collection or replaced with a guessed visual.
 */
export function buildTraitAssemblyManifest({ collection, traits = [], registry, character = {} } = {}) {
  const collectionKey = text(collection).toLowerCase();
  if (!collectionKey) throw new TypeError('collection is required');
  if (!registry || typeof registry.get !== 'function') throw new TypeError('trait asset registry is required');
  const target = { ...character, collection: collectionKey };
  const entries = list(traits).map((trait, index) => {
    const type = text(trait?.type ?? trait?.trait_type ?? trait?.traitType);
    const value = text(trait?.value);
    if (!type || !value) return { index, type, value, status: 'invalid-source-trait', reason: 'trait-type-and-value-required', assetId: null, slot: '' };
    let asset;
    try { asset = registry.get({ collection: collectionKey, type, value, variant: text(trait?.variant) || 'default' }); }
    catch { asset = null; }
    if (!asset) return { index, type, value, status: 'missing-asset', reason: 'trait-asset-not-found-in-collection', assetId: null, slot: '' };
    const eligibility = canEquipTrait(asset, target);
    return { index, type, value, status: eligibility.ok ? 'ready' : 'blocked', reason: eligibility.reason, assetId: asset.id, slot: asset.slot, modelRef: eligibility.ok ? asset.modelRef : '', materialRef: eligibility.ok ? asset.materialRef : '', textureRefs: eligibility.ok ? [...asset.textureRefs] : [] };
  });
  const ready = entries.filter(entry => entry.status === 'ready').length;
  return Object.freeze({ collection: collectionKey, totalTraits: entries.length, readyTraits: ready, blockedTraits: entries.length - ready, complete: entries.length > 0 && ready === entries.length, entries: Object.freeze(entries) });
}
