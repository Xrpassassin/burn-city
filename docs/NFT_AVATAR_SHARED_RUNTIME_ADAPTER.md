# Shared NFT Avatar Runtime Adapter

## Purpose

Zombies and Zombies: Homefront should share the same approved NFT character asset, collection/token identity, and asset hash. They must **not** share game-mode-specific gameplay controllers. This adapter resolves one candidate into a small, explicit runtime contract for each mode.

- **Zombies** receives its combat animation/equipment profile and combat capabilities.
- **Homefront** receives its survival animation/equipment profile and settlement/survivor capabilities.
- Both point to the same GLB and identity, so a character is not reconstructed or re-authored independently for each mode.

## Approval gates

A candidate is refused unless it has a GLB URI, explicit runtime approval, rights approval, visual review, performance profiling, and rig validation. The current Blender generator creates only a procedural blockout, so its output must remain refused by default.

## Integration

Browser:
```js
const result = BurnCityNFTAvatarRuntime.resolveAvatarRuntime(candidateRecord, "homefront");
// Load result.asset.uri only when result.ok is true.
```

Node:
```js
const { resolveAvatarRuntime } = require("./client/js/nft-avatar-runtime-adapter.js");
const result = resolveAvatarRuntime(candidateRecord, "zombies");
```

Do not interpret this adapter as an asset loader, NFT ownership verifier, or approval service. The caller must obtain the candidate record from a trusted source and enforce ownership/entitlement policy separately. Keep runtime asset hosting allowlisted in the game integration.

## Test

Run `npm run test:nft-avatar-runtime-adapter`. This test verifies shared identity, separate mode profiles, and fail-closed approval gates. It does not prove integration into the live game client.
