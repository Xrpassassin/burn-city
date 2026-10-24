# BURN City realistic NFT walker avatars

## Scope

This draft upgrades the characters seen while exploring BURN City. It uses the existing wallet-verified NFT selection and /api/nft metadata pipeline for the supported RACC, Firekeepers and 589 Protocol collections. No new collection is trusted from client-supplied metadata, and ownership verification remains server-side.

## Changes

- Replaced the mostly rectangular NFT mannequin with a smoother articulated character and collection-specific RACC raccoon anatomy.
- Uses the XRPL.to documented NFT-by-NFTokenID API as an **optional metadata/media enrichment source** for marketplace-origin records, while the XRPL ledger and on-ledger URI remain authoritative for ownership and primary metadata. Metadata records are matched by exact NFTokenID; marketplace data never grants ownership.
- Preserves up to 64 typed trait pairs (trait type + value, each bounded) instead of truncating the visual input to 16 untyped values. Names, description, external URL, original artwork URI, animation/video/audio references, optional 3D-model reference and a bounded media-file list are cached with a versioned metadata schema.
- On-ledger attributes take precedence; marketplace attributes fill in missing trait types. API timeouts/errors fall back to on-ledger metadata and the existing procedural avatar.
- Cached artwork is resized with `contain` framing instead of `cover` cropping so the NFT's full composition is retained.
- Trait rendering now uses typed values for skin/fur, clothing, headwear, eyes, masks and background halo; recognized mouth/expression, wings and weapon/gear traits receive additional 3D details. The full typed trait list and discovered media references are retained on the avatar for further collection-specific adapters.
- Original artwork remains visible on the character as a portrait medallion, with optional floating identity card. Unknown traits are retained rather than discarded; not every arbitrary trait can yet be faithfully converted into geometry without a collection-specific renderer or source model.
- The picker credits XRPL.to for enriched index data. The client still uses the existing Three.js runtime, no new dependencies.
- Service-worker cache version is now `bc-v95-nft-traits`.

## Compatibility and licensing

- Preserves the existing NFT picker, verified ownership path, wallet selection and supported collection IDs.
- No new dependencies, runtime CDN model requests, or third-party model files were added. The avatar uses the project's existing Three.js runtime and procedural geometry, avoiding an unverified asset license.
- This is a more detailed stylized game character, not yet a photorealistic scan or a one-to-one 3D reconstruction of every PFP. Trait metadata is incomplete/inconsistent across NFT sets, so the image medallion preserves exact artwork while trait matches provide a best-effort 3D representation.

## Validation

- Adds client/js/nftchar.test.mjs, a dependency-free architecture/regression test for geometry, collection-specific variants, trait mapping, artwork overlay, animation, mobile detail and cache version.
- Adds the test to npm test and npm run test:all.
- Browser/WebGL visual review and mobile frame-time checks remain required. The test does not prove that all remote image URLs load or that every collection's trait vocabulary is fully represented.
