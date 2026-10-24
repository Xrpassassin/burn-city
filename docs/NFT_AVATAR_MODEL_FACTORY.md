# BURN City NFT Avatar Model Factory

## Goal

Build a repeatable, auditable path from collection artwork and typed traits to a game-ready character asset. Preserve token identity, collection-specific silhouettes, material cues, and signature items. Keep ownership verification and gameplay authority separate from rendering.

## Production stages

1. Intake: record collection key, token ID, artwork reference and optional digest, raw trait snapshot, source provenance, and issuer/taxon verification state. Never infer collection identity from a display name alone.
2. Normalize traits: retain original names and values while deriving canonical render slots. Unknown traits must remain visible in QA reports.
3. Resolve a recipe: combine a collection blueprint with token-specific components. Collection blueprints define signature anatomy, clothing language, palette, and proportions; token traits drive individual differences.
4. Author/build: use procedural Three.js components as a deterministic fallback. For distinctive silhouettes, author or generate assets offline and export GLB/glTF. Preserve immutable source files and record tool versions.
5. Optimize: set explicit units, rig compatibility and mobile budgets. Optimize a build copy with glTF Transform only after inspecting the source.
6. Review: compare front, three-quarter, side and rear views against actual NFT artwork. Record notes and mobile performance. Runtime approval requires explicit rights, a built output, passing visual QA and passing mobile profiling.
7. Integrate: load only reviewed local assets through the game asset loader. Keep a safe procedural fallback. Never load arbitrary model URLs supplied by NFT metadata.

## Repository contract

- assets/nft-avatars/collections/: collection manifests and verified collection identity.
- assets/nft-avatars/models/: reviewed runtime GLB files only.
- assets/nft-avatars/sources/: rights-approved source artifacts; use controlled external storage for large files.
- assets/nft-avatars/model-factory.schema.json: canonical manifest shape.
- scripts/nft-avatar-model-factory.mjs: dependency-free manifest approval gate.
- scripts/nft-avatar-model-factory.test.mjs: regression coverage for provenance and runtime gates.
- client/js/nft-avatar-collection-recipes.js: executable RACC, Firekeepers, 589 Protocol, and generic recipe registry used by reconstruction.
- client/js/nft-avatar-collection-recipes.test.mjs: contract checks for budgets, trait-slot hints, artwork gate, and resolver integration.
- docs/NFT_AVATAR_COLLECTION_RECIPES.md: recipe authoring contract and visual acceptance criteria.
- client/nft-avatar-visual-qa.html: human review tool; attach its report to each candidate asset record.

## Commands

Run focused tests with: `node scripts/nft-avatar-model-factory.test.mjs` and `node client/js/nft-avatar-collection-recipes.test.mjs`.

Validate a candidate with: node scripts/nft-avatar-model-factory.mjs path/to/manifest.json

The manifest schema records collection and token identity, raw traits, source format/units/digest, author/license/redistribution, pipeline version, output digest/size, visual QA, mobile performance, and runtime approval. A GLB existing on disk is not enough to make it eligible for the game.

## Hark handoff and isolation

This branch adds tooling and a contract only. It must not merge, deploy, mutate production data, or overwrite Hark's Fly.io-only work. Hark can review the contract and integrate the runtime loader in a separate branch after review.

## Definition of done

- Every sample has stable collection/token identity and a preserved trait snapshot.
- Every imported asset has author, license, redistribution decision, source URI and digest.
- Every build records pipeline/tool versions, output digest, size, units, and budgets.
- Unknown traits are surfaced instead of silently discarded.
- Visual likeness and mobile performance are separately reviewed.
- Runtime selection is deterministic, local-asset-only, and has a safe fallback.
- Automated tests cover malformed manifests and all runtime approval gates.

This is the infrastructure foundation, not a claim that all NFTs have already been converted to final-quality 3D. The first executable recipes now define collection-specific silhouette/proportion inputs, trait-slot hints, material language, visual acceptance criteria, and target mobile budgets for RACC, Firekeepers, and 589 Protocol. Collection-by-collection mesh authoring/generation, rights-reviewed asset intake, and in-game visual validation remain subsequent stages.
