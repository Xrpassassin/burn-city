# Cinderwilds exploration map

## Design
- Small corner minimap plus an openable field map (keyboard **M**, close with **M** or **Escape**, or use the on-screen button).
- Fernway Verge and Glassroot Grove have separate maps and separate explored-cell records.
- Canvas 2D only; no third-party mapping dependency, tile service, image assets, or network requests.
- The map is intentionally not a full-area reveal. Terrain, paths, water, and named landmarks are drawn only after the player has explored the corresponding cells.
- Revealed cells persist in localStorage on that device. This is not yet a server-synced or cross-device exploration record.
- The minimap is player-centered and only shows a limited nearby radius. The full map shows the whole zone boundary with unexplored ground concealed.
- The map is hidden outside active on-foot exploration and during Wilds encounters/modals.

## Integration
- `client/js/wilds-map.js`: standalone Canvas 2D UI, reveal grid, rendering, local save.
- `client/js/wilds.js`: creates/disposes the map with the lazy-loaded Wilds lifecycle and updates player/zone state.
- `client/js/wilds-deep.js`: exposes Glassroot Grove's authored trail, creek and landmarks to the map.
- No service-worker precache change: Wilds modules are loaded on demand and are handled by the existing runtime caching policy.

## Validation checklist
- [ ] Enter Fernway Verge; confirm minimap appears and only nearby cells are revealed.
- [ ] Walk away; confirm the revealed footprint grows gradually, not all at once.
- [ ] Press M / use the expand button; verify full map, unexplored fog, landmarks and Escape-to-close.
- [ ] Reload or leave/re-enter; verify explored cells persist locally.
- [ ] Enter Glassroot Grove; confirm a separate map, correctly positioned player, and no Fernway progress leakage.
- [ ] Return to Fernway Verge; confirm its progress is retained.
- [ ] Test desktop, iPhone portrait/landscape, keyboard focus, combat/modal behavior and map touch targets.
- [ ] Check browser console and performance on a lower-end mobile profile.

## Current limitations
- The map is an exploration aid, not navigation/pathfinding; it does not plot routes or reveal enemies.
- Explored-cell saves are local to the browser/device. Multiplayer synchronization and account-level persistence are not implemented.
- The current map is a schematic based on authored trail/creek coordinates; it is not a live terrain-height map.
