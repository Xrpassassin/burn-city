# Open-Source Model Reuse for NFT Avatar Collections

## Goal

Use legally reusable, production-appropriate 3D assets to accelerate collection-specific base models and trait libraries. Reuse geometry and tooling where it fits; never treat a generic asset as a substitute for a collection's defining silhouette or NFT-specific traits.

## Collection isolation

Every asset belongs to exactly one collection namespace unless a reviewer explicitly approves a separately authored shared utility asset. RACC trait assets must not resolve for 589 Protocol or Firekeepers. A shared *technical* asset (for example, a generic attachment-point helper or shader) is not a shared *visual trait*.

Each collection should have:
- A distinct base model and rig family.
- A collection-local trait alias map and canonical trait keys.
- Collection-local asset records and attachment anchors.
- Reference artwork and sample NFTs for likeness review.
- Separate visual approval and rights/licence approval.

## Preferred reuse strategy

1. **Start with existing open-source base meshes** when their silhouette, topology, scale, and licence are suitable.
2. **Adapt and document** the mesh to the collection's anatomy, proportions, UVs, material setup, and rig. Record upstream URL, author, version/commit, licence text or SPDX identifier, modifications, and attribution requirements.
3. **Build traits as modular assets** (GLB where practical) with named slots, pivot/origin conventions, scale units, and rig/collection compatibility.
4. **Generate a collection-local trait manifest** that maps the source metadata's exact type/value to a reviewed asset. Do not infer missing traits from rarity or neighbouring NFTs.
5. **Run automated checks** for file integrity, polygon/texture budgets, valid paths, declared units, rig compatibility, attachment slots, and collection boundaries.
6. **Run visual QA** against original NFT artwork from front, side, and three-quarter views, plus a gameplay camera distance.
7. **Keep the original art as a reference**, not as an automatic substitute for a real 3D character.

## Licence and provenance gate

Openly downloadable does not necessarily mean open-source or commercially reusable. Before importing any model, verify the actual licence attached to that exact asset and version.

- **CC0 / public domain dedication:** generally the simplest reuse path, subject to provenance and jurisdiction checks.
- **CC BY:** may be usable with required attribution and notices; preserve the attribution chain in the asset record.
- **CC BY-SA:** requires review of share-alike obligations and how they apply to the adapted asset and distribution.
- **CC BY-NC / other non-commercial terms:** do not use in a commercial game or paid collection integration unless counsel confirms the intended use is permitted.
- **GPL, LGPL, MPL, custom marketplace terms, or unclear licences:** review the exact terms before integration; do not assume software licences automatically govern 3D assets in a predictable way.
- **No licence or unverifiable provenance:** status remains pending/rejected; do not ship or redistribute the asset.

This is an intake policy, not a legal opinion. Rights approval must be a human-reviewed, per-asset decision and cannot be inferred from a repository being public.

## Asset record minimum

For every imported or adapted asset, retain:
- Stable asset ID and owning collection key.
- Kind, repository-relative path, file SHA-256, format, units, and polygon count.
- Original source URL and upstream author/creator.
- Exact licence name/SPDX identifier and a link or archived copy of the licence terms.
- Attribution text and redistribution permission.
- Upstream version/commit and a concise modification log.
- Rig family, compatible attachment slots, and required anchors.
- Visual-review status, reviewer/date, rights-review status, reviewer/date.
- Any restrictions or known technical limitations.

The existing `scripts/nft-avatar-asset-pipeline.mjs` validator is the intake gate for local assets. Its manifest passing is a structural check only; it does not independently establish that a licence is valid or that a model resembles a collection.

## Suggested first production passes

### RACC
- Evaluate a suitable raccoon/anthropomorphic base mesh, but preserve the NFT's rounded skull, eye mask, muzzle, ears, and ringed tail as collection-defining features.
- Build or adapt the collection's recurring headwear, outfits, masks, tails, and held props as separate reviewed assets.
- Use the source NFT art to guide markings and colour; do not flatten distinctive 3D features into a generic texture if the silhouette requires geometry.

### 589 Protocol
- Evaluate a separate humanoid base appropriate to the collection's body proportions.
- Create its own clothing, headwear, chains, hair, facial hair, markings, and weapon/gear assets from its own trait vocabulary.
- Do not import RACC hats, masks, outfits, or prop meshes as semantic trait matches. Generic rigging tools may be reused; visual assets require explicit collection compatibility.

### Firekeepers
- Evaluate a distinct robed humanoid base with layered cloth and a rig suitable for the intended animations.
- Build collection-local robe layers, cowls, mantles, relics, sigils, and emissive flame elements.
- Preserve silhouette readability and avoid flame effects obscuring the face.

## Acceptance criteria

An asset is ready for avatar assembly only when:
- Its collection namespace and trait identity are explicit.
- Source provenance and licence are recorded and approved.
- The file is local, integrity-checked, and compatible with the intended runtime.
- Units, pivot, rig family, and attachment slot are defined.
- The model has passed collection-specific visual review.
- The assembly resolver can select it by exact collection + trait type + trait value (+ variant).
- Negative tests prove the asset cannot be equipped by a different collection.

## Non-goals

This process must not auto-approve third-party rights, automatically rehost source artwork, change NFT ownership/access rights, or infer that an NFT holder owns the intellectual-property rights to the underlying artwork.
