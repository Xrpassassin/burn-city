# Estates Island — licensed model pilot

The existing procedural buildings remain the production fallback. The optional adapter at `client/js/estates-island-model-pilot.mjs` is for evaluating **one starter house and one mansion** before expanding the asset library.

## Asset intake
1. Download a candidate model only from a source with clear redistribution and game-use rights. Record creator, source URL, license, modifications, and attribution requirements in the project asset ledger. Never assume a model is open-source just because it is downloadable.
2. Convert and optimize it to GLB, preserving original source files and the license notice. Prefer low material counts, compressed textures, consistent +Y up, and a documented front-facing direction.
3. Store the reviewed file under `client/assets/estates/` and supply its relative path to the adapter. The registry intentionally accepts only local GLB paths.
4. Use the host's existing Three.js namespace and compatible GLTFLoader. After the island renderer creates its root, call `installEstateModelPilot({THREE,root:renderer.root,manifest,loader,registry,onStatus})`. This is **not yet wired into the live host**; it must be explicitly enabled only after asset and mobile QA.
5. Confirm proportions, entrance orientation, camera collision, draw calls, memory, and licensing on desktop and mobile. The adapter swaps only structural blockouts; old facade details remain and may overlap. Remove or adjust them after visual review.

## Example registry (only after approved assets exist)

```js
const registry = {
  starter: {url:'./assets/estates/starter-house.glb',license:'CC0-1.0',attribution:'Original creator / source recorded in asset ledger'},
  mansion: {url:'./assets/estates/mansion.glb',license:'CC-BY-4.0',attribution:'Creator and original source recorded in asset ledger'}
};
```

No assets have been downloaded or licensed by this change. No visual comparison or runtime benchmark has been completed. Property ownership, purchases and guest access are unaffected.
