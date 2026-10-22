# BURN City: zombie and environment visual asset plan

## Existing systems to preserve

The zombie-survival environment in `client/arena/cod.js` procedurally builds merged wall geometry, vertex-color gradients, texture-mapped walls/floors, barricade boards, debris, fire planes, labels, and refinery props. The server defines weapon behavior in `server/cod.js`. Keep weapon IDs, combat values, hit volumes, map grid, and server authority independent of cosmetic assets.

## Open-license candidates

- **Zombie models and animation:** [Quaternius Zombie Apocalypse Kit](https://quaternius.com/packs/zombieapocalypsekit.html). Its source page lists 60 models, animated characters, and CC0. Check skeleton, clips, scale, and exact downloaded-pack license before integration.
- **Modular walls, floors, doors, windows:** [Kenney Building Kit](https://kenney-assets.itch.io/building-kit). The pack page lists 80+ models, glTF/FBX/OBJ, and CC0 1.0. Use as a separate prop experiment, not as a replacement for grid-authoritative collision.
- **Future pirate region props:** [Quaternius Pirate Kit](https://quaternius.com/packs/piratekit.html). Verify the specific pack page and archive license before shipping.
- **Three.js model loading:** [GLTFLoader documentation](https://threejs.org/docs/#examples/en/loaders/GLTFLoader).

Do not import assets from other commercial games or treat an unclear “free download” as a reuse license. Keep a source/license ledger for every asset pack.

## Custom BURN City edits

- Zombies: create recognizable shamblers, runners, armored brutes, and crawlers with different silhouettes, scale, palette, clothing/armor add-ons, and animations. Preserve server zombie types and hit volumes.
- Player skins: cosmetic-only palettes/accessories; no gameplay stats or hitbox changes.
- Weapons: map the existing server weapon IDs to visual meshes and effects. Visual upgrades may change the appearance, never the server's damage, range, cooldown, fuel, or purchase rules.
- Refinery walls: first improve the current merged geometry using concrete/oxidized-metal palettes, grime, warning markings, damage decals, and doorway readability. Keep collision tied to the server grid.
- Signature style: recolor and kitbash licensed models, add original BURN City insignia, and keep the art direction consistent across regions.

## Safe integration order

1. Hark records the existing automated-test and mobile-performance baseline.
2. Build an isolated, debug-only GLTF asset sandbox to inspect model scale, pivot, materials, skeleton, animation clips, and file size.
3. Add one zombie model behind a feature flag, with the current procedural model as fallback; validate spawn/despawn, animation updates, disposal, reconnects, and mobile frame time.
4. Add cosmetic weapon models keyed by existing weapon IDs.
5. Add player skins with a safe default and server validation if players can select them.
6. Test modular environment props only where they agree with the existing collision grid.

## Acceptance gates

- Record source URL, pack name, license, and attribution terms for every imported asset.
- No large binary pack or runtime dependency until the isolated prototype proves it is needed.
- Keep low-quality/mobile mode, existing combat, network protocol, and collision behavior intact.
- Report automated tests separately from browser and device observations.

This plan does not claim that any external asset has been downloaded or integrated.
