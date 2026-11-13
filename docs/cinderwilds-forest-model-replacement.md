# Cinderwilds forest model replacement

Implementation handoff for Grok. Replace the normal city-facing forest silhouette and the playable Fernway Verge vegetation with a dark pine ridge, copper oak pockets, and a bare snag that players can recognize from both sides of the gate. Keep the existing procedural meshes available per asset as a load-failure fallback.

## Source models

| Use | Source | License and import notes |
| --- | --- | --- |
| Skyline and trail pines | [Pine Trees Pack by LOLIPOP](https://sketchfab.com/3d-models/pine-trees-pack-lowpoly-game-ready-lods-e1e9c07b8e2e445c943fec660beefba2) | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Fifteen variants with LODs and 16-triangle billboards. Start with three canopy shapes and one sapling. |
| Copper crowns and clearing oak | [Seasonal Oak Trees by LOLIPOP](https://sketchfab.com/3d-models/oak-trees-pack-17var-lods-seasons-gameready-a5e4e64f9f1d4089bdcc6170a9333393) | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Select one medium tree and one landmark oak, early autumn. The author links supplementary seasonal billboard textures on the listing. Confirm the chosen textures are present and carry the pack license. |
| Snag, roots, ferns and rocks | Poly Haven [Dead Tree Trunk](https://polyhaven.com/a/dead_tree_trunk), [Pine Roots](https://polyhaven.com/a/pine_roots), [Fern 02](https://polyhaven.com/a/fern_02), [Rock Moss Set 02](https://polyhaven.com/a/rock_moss_set_02) | [CC0](https://polyhaven.com/license). Use selected assets. Reserve detailed meshes for trail landmarks and close views. |
| Creek crossing | [LP slightly damaged wooden bridge by Dawid](https://sketchfab.com/3d-models/lp-slightly-damaged-wooden-bridge-f57422aa52934ed0a088269b59e4bb9d) | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). The listing shows 23.2k triangles. Fit the deck to one existing crossing and simplify the render mesh if needed. |

Listings and licenses were checked. Archives, embedded materials, seasonal textures, and performance still need validation. Export the chosen assets as local glTF/GLB with meter scale, ground-level origins, alpha-masked foliage, and shared textures where practical. Follow the existing loader patterns in [cityprops.mjs](../client/js/cityprops.mjs) and [default-player-avatar.mjs](../client/js/default-player-avatar.mjs). Add CC BY credits to [city-credits.html](../client/city-credits.html) with the original title, author, source URL, license link, and a note covering edits such as decimation or recoloring.

## City-facing skyline

- Replace the cone crowns and flat ridge composition in [wilds-gate.js](../client/js/wilds-gate.js), inside `buildForestHorizon()`. Build an uneven treeline in a few depth bands with instanced pine billboards, sparse copper crowns and the silhouette of the entrance snag. Leave a visible gap on the trailhead approach.
- Keep the skyline visual only. Keep the initial city request limited to lightweight skyline assets. Leave creature data, music and playable models on the existing forest loading path. Retain the current procedural skyline if the new assets fail.
- Keep the `G.horizon` visibility handoff in `frame()` and the deep realm's `cityOff()`/`cityOn()` behavior. Match the front edge and landmark positions between the skyline and Fernway Verge so the silhouette reads consistently as it swaps. Check at street level and in Orbit mode.

## Playable Fernway Verge

- Replace the visuals in the tree, rock and ground-cover passes inside `buildWorld()` in [wilds.js](../client/js/wilds.js). Reuse the seeded placement and existing trail, creek, camp and clearing exclusions. Group repeated models by mesh/material and choose detail by distance and device tier. Use the tallest pine meshes sparingly and keep ferns in the near-detail group.
- Use the existing `MAIN` and `RET` loop. Make the route from the gate to the old tram stop and Mara's camp legible, place the copper oak by `CLEAR`, and use the damaged bridge for one existing creek crossing. The other crossing can provide a second route via stepping stones if traversal and creature navigation work with it. Keep the `THRESH` spur to Glassroot Grove clear. This first pass targets Fernway Verge, with the existing Glassroot Grove assets serving that zone.
- Keep render meshes and gameplay collision separate. `addCollider()` also registers obstacles for Wilds navigation, so match trunk and rock proxies to the visible footprint and verify creature routes as well as player movement. Use the existing walkable bridge deck behavior and align the model to it. Keep marker and minimap positions synchronized if a crossing or trail moves.
- Use the existing load and unload lifecycle for imported assets. Prepare the forest before revealing it, keep each missing asset on its procedural fallback, and ensure `disposeTree()` releases forest-owned resources without disposing anything still used by the city skyline.

## Review before merge

- [ ] Verify the imported archives open with bark and foliage textures, correct scale, and the intended LODs. Confirm the in-game credits match every shipped source.
- [ ] Capture before/after shots from the same Burn City street and Orbit cameras, then from the Fernway Verge gate, bridge and oak clearing. Verify the skyline swaps without duplicate trees or a blank frame.
- [ ] On desktop and mobile, walk the full loop, cross the creek, use the return gate, enter Glassroot Grove, and come back. Check collisions, creature and companion pathing, markers, and the map.
- [ ] Test entry, exit, unload and re-entry with `?wildstest`. Simulate an asset failure and confirm the affected visuals fall back and the gate remains usable.
- [ ] Record before/after city startup requests, forest load time, draw calls, and frame time on a phone or a representative low tier. Confirm detailed forest requests remain off city startup.
- [ ] Run `npm run test:wilds`, `npm run test:wilds-pathfinding`, and `npm run test:graphics-labs` with the implementation.
