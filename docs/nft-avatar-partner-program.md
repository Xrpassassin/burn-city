# BURN City NFT Avatar Partner Program — Technical Plan

## Product principle

A supported NFT should resolve to a stable, holder-specific character identity. The source NFT artwork remains the fidelity reference; normalized metadata and a collection-specific adapter determine how the 3D body, silhouette, materials, face, accessories and animations are built. Ownership verification is a separate server-side concern.

## Integration tiers

### 1. Individual NFT avatar

For a one-off commission or a small number of requested NFTs:
- Confirm collection, token ID, ownership/authorization and display rights.
- Build a dedicated mapping for the token's visual traits, or a custom avatar if its artwork cannot be represented by existing parts.
- Keep original art visible and attach the normalized character profile to the verified token identity.
- Test at desktop and mobile budgets before enabling the avatar in public sessions.

Best fit: one-off creators, special editions, unusual PFPs, or a few flagship characters.

### 2. Collection adapter

For a project with a meaningful number of holders:
- Register a server-approved collection identifier and issuer/taxon or other stable XRPL collection identity; never trust a client-provided collection name as proof.
- Add a versioned adapter with aliases for the project's actual trait schema, archetype/silhouette rules, materials, accessories, animation hooks and unsupported-trait fallbacks.
- Keep raw source traits alongside normalized render traits so adapter improvements do not destroy metadata.
- Test representative samples across common, rare and unusual trait combinations, including mobile performance and malformed metadata.

Collection pricing should reflect the number of distinct visual components, trait complexity, source asset quality, licensing/permissions and QA burden—not only the total number of minted NFTs. A collection of 10,000 tokens sharing 30 layers may be less expensive to support than a collection of 200 individually illustrated characters.

### 3. Premium 3D conversion

For projects supplying layered artwork, licensed models, or a budget for custom modeling:
- Use original layered source files or approved models where available.
- Verify file format, scale, rig compatibility, materials, animation rights and redistribution permissions before integration.
- Keep original NFT art as the reference and fallback; do not imply that arbitrary metadata or an image automatically yields an exact rigged 3D model.

## XRP payment and entitlement design (future work)

Payment collection is not implemented by this avatar branch. When commercial onboarding is built, use a server-controlled invoice and fulfillment flow:
1. Create a unique order ID and invoice reference for the approved individual NFT or collection integration.
2. Display a fixed XRP amount and the exact receiving address to the customer; never ask for wallet seeds or secret keys.
3. Verify payment from a validated XRPL ledger transaction on the server. Check destination, exact amount, XRP currency, invoice/reference, successful result, and replay/duplicate status.
4. Move the order through explicit states such as quoted, awaiting_payment, paid, in_build, qa, enabled, or refunded.
5. Enable a collection only through server-owned configuration after rights review, implementation and QA. A payment alone must not add an arbitrary collection to the client allowlist.
6. Record transaction hash, order ID, deliverable/version, approval, and any refund/adjustment for auditability.

Do not trust screenshots, client callbacks, unvalidated transactions, memo text alone, or a wallet's self-reported payment status. Define refund, failed-build, scope-change, maintenance and future compatibility terms before accepting commercial orders.

## Security, rights and privacy

- XRPL ledger ownership remains the source of truth for holder access; market/index APIs may enrich metadata but cannot grant ownership.
- Never request or store wallet secret material.
- Do not load arbitrary remote model files as executable code. Validate formats and assets in a controlled pipeline.
- Obtain written permission for collection branding, artwork/model use, redistribution and promotional examples. Keep attribution and license records with the adapter.
- Collection configuration, payment verification, and entitlement decisions are server-controlled; client metadata is presentation data only.

## Current implementation boundary

The avatar branch currently supports the existing RACC, Firekeepers and 589 Protocol flows. It adds a collection-aware trait-normalization layer and preserves original traits. It does not yet expose public self-service collection onboarding, quote generation, XRP payment processing, or automatic collection activation. Those should be separate reviewed server-side work, not bundled into the client renderer.
