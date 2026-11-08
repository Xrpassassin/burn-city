# NFT Trait Asset Framework (RACC / 589 Protocol / Firekeepers)

## Purpose

This is the reusable foundation for a token-indexed visual reference catalog and canonical, composable trait library. It does not claim that assets already match XRP.cafe art. Every trait starts unapproved; the pipeline records evidence and gates equip/use until rights and visual review are approved.

## Data model

- **Collection inventory**: verified collection identity (canonical source slug, XRPL issuer and taxon), paginated token IDs, observed and expected counts, completeness/errors.
- **NFT source record**: exact 64-hex NFTokenID, collection, source URL, metadata URL, artwork URL, untouched source trait names/values, provenance and fetch status.
- **Canonical trait asset**: collection namespace + canonical trait type/value + variant; 3D model/material/texture references; slot; compatible rig families/collections; source token IDs/artwork references; version; rights state; visual approval.
- **Equipped configuration**: game character ID, canonical trait asset ID/version, attachment anchor and transform. This is an in-game loadout, not XRPL metadata mutation or ledger transfer.

## Invariants

1. NFTokenID is the identity key. Names are never unique identifiers.
2. Preserve original metadata; normalization is a separate index.
3. Reuse a trait asset only when visual evidence supports equivalence. Similar labels alone are insufficient; variants need distinct variant IDs.
4. Collection namespaces prevent collisions. Cross-collection reuse requires explicit compatibility.
5. Rights and visual approval fail closed. Unreviewed assets cannot be equipped.
6. A reference image is evidence, not a 3D asset. A billboard/tabard never counts as reconstruction.
7. Missing pages, API failures, duplicates, issuer/taxon mismatches or count mismatches mean inventory is incomplete.
8. Unknown traits remain visible in unresolved-work reports; never silently substitute generic lookalikes.

## Pipeline

1. Discover and verify canonical XRP.cafe slug and XRPL issuer/taxon for all three collections.
2. Enumerate every page with bounded pagination/rate limiting. Record checkpoints, timestamps, errors and expected count.
3. Normalize URLs/traits while preserving raw metadata. Allow HTTP(S) and explicit IPFS URIs; resolve IPFS through configured gateways.
4. Cluster traits by collection/type/value, then compare actual artwork. Clusters are candidates, not proof of visual equivalence.
5. Build geometry/material assets from reviewed examples, including rig attachment, transforms, occlusion/collision and compatibility.
6. Review front, side, rear and three-quarter views. Record reviewer, date, source links, screenshots, mismatches and approval state.
7. Enable trait inventory/equip only for rights-approved and visually reviewed assets. Save loadouts separately from NFT metadata.
8. Report per collection: expected/observed inventory, unique IDs, metadata/art coverage, traits cataloged, assets built/approved, rights-pending assets, unsupported values and unresolved mismatches.

## Transfer semantics

“Transfer trait” means an in-game loadout change between compatible characters. It does not transfer the underlying NFT, alter ledger metadata, or prove ownership. Scarce/owned trait items require a separate server-authoritative inventory and permission policy.

## Security and operations

- Verify every token issuer/taxon against a reviewed allowlist.
- Use timeouts, bounded retries, rate limits, resumable checkpoints and caching.
- Validate URL schemes and restrict asset loading to approved origins/gateways; never execute metadata content.
- Treat remote metadata as untrusted input and escape display text.
- Avoid committing duplicate image blobs to git by default; use a manifest plus cache/object storage. Check rights and attribution before distributing assets.
- Do not require wallet connection just to browse public references.
- Keep imports deterministic and idempotent; report partial failures.

## Current foundation

- `client/js/nft-trait-asset-registry.mjs`: canonical keys, source normalization, safe URL helpers, registry, fail-closed equip compatibility and inventory completeness checks.
- `client/js/nft-trait-asset-registry.test.mjs`: tests canonicalization, invalid IDs, unsafe URLs, IPFS resolution, source reuse, unapproved collections, compatibility, rights/visual gates and incomplete inventory.

This is framework code only. A separate adapter must connect to XRP.cafe's currently supported endpoints, and models still need to be authored and reviewed. Do not mark inventories complete until paginated ingestion and count reconciliation succeed.
