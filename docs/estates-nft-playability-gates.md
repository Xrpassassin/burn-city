# Estates + NFT avatar playability gates

Status: implementation checklist; not a claim that models or wallet permissions are production-ready.

## Current boundaries
- Estates Island has a renderer-agnostic scene manifest, procedural tier facades, navigation, and a live entry controller.
- Estate GLB pilot is optional and not yet connected to the live host. Starter and mansion GLBs require asset rights review and mobile QA.
- NFT characters have collection-specific trait recipes (RACC, Firekeepers, 589), procedural presentation, and a Blender blockout pipeline. Blockouts are **not** faithful NFT replicas or approved runtime assets.
- The shared NFT runtime adapter already defines an `estates-island` mode, but it does not verify NFT ownership or load GLBs. A client-provided `runtimeApproved` flag is **not** a trusted approval decision.

## Minimum playable Estates vertical slice
1. Enter via explicit city gate; return to city with position and controls restored.
2. Walk from gate to one starter home and one mansion using the same walking input as the city.
3. Render a visible entrance affordance at each building. Show public property details without implying verified ownership.
4. Keep property access, wallet invitation, purchase and revenue distribution **disabled** until server authorization and transaction tests are complete.
5. Load a reviewed GLB per tier only when its license/provenance ledger, rig/scale, collision and mobile budgets pass. Keep procedural fallback on failure.
6. Add a representative NFT avatar with source artwork and trait mapping. Test front, side, back, idle, walking, accessories, clipping, and FPS on mobile.
7. Only server-verified NFT ownership may grant holder-only avatar selection; possession of metadata or a client flag is not authorization.

## Release acceptance tests
- Two properties using the same GLB share one download but use independent cloned scenes.
- Island re-entry and exit cleanly dispose resources and restore movement.
- Missing or invalid GLB preserves the procedural house.
- No property UI implies ownership based on unverified client state.
- NFT candidate with missing rights, visual, performance or rig approval is rejected.
- Every approved model has collection, token ID, artwork reference, trait-by-trait QA, creator/source/license, and asset hash recorded.
- Mobile rendering and controls are tested in the actual deployed environment before declaring playability.

## Next engineering slice
Implement an isolated, renderer-level estate entrance affordance and proximity inspection, with no new ownership claims; then run focused tests and real-device QA. Separately, create one reviewed NFT per collection before scaling up batch production.
