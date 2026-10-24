# Procedural GLB blockout build pipeline

This stage turns the token build specification into a real, deterministic Blender-generated GLB **blockout candidate**. It is the first mesh-producing stage; it is not the final NFT-specific model and must not be presented as a faithful reconstruction.

## Prerequisites

- Node.js 22+
- Blender with the glTF 2.0 exporter available
- A token build spec produced by `scripts/nft-avatar-build-spec.mjs`

Set `BLENDER_BIN` if Blender is not on PATH.

## Build

```sh
node scripts/nft-avatar-build-spec.mjs path/to/token.json /tmp/token-build-spec.json
node scripts/nft-avatar-build-pipeline.mjs /tmp/token-build-spec.json assets/nft-avatars/generated/racc/RACC-42.glb assets/nft-avatars/generated/racc/RACC-42.candidate.json
```

The Blender script builds named body parts and collection signature blockout geometry: RACC mask/muzzle/ringed tail, Firekeepers layered robe/cowl/ember sigil, or 589 Protocol streetwear/insignia/chain. This is deliberately low-detail geometry intended to validate the end-to-end export path and provide a replaceable authoring scaffold.

The orchestrator:
- validates the spec and safe token ID;
- refuses to overwrite an existing GLB or candidate record;
- runs Blender in background mode;
- checks the GLB magic header, calculates SHA-256 and byte size;
- writes a candidate record with the build provenance;
- always sets `runtimeApproved: false`, rights pending, visual QA not reviewed, mobile performance not profiled and rigging unrigged.

## Current constraints

- Artwork references are metadata only; the pipeline does not fetch external URLs.
- Generated geometry is a procedural blockout, not a rigged production character. Pieces are named for later rig binding; no compatible skeleton or animation is generated.
- It does not automatically texture-map every raw NFT trait, infer copyright/redistribution permission, or verify token ownership.
- No candidate becomes a runtime asset without replacing/augmenting blockout geometry, human rights review, original-artwork comparison, rig validation, GLB optimization, and mobile-device profiling.
- Use a disposable output path for first runs. Existing output files are never overwritten.

## Regression

`npm run test:nft-avatar-build-pipeline` tests input validation and the no-false-approval candidate contract. CI can validate the Node orchestration without requiring Blender; a separate Blender-enabled runner is needed to exercise actual mesh export.
