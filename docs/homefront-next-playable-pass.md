# Homefront Next Playable Pass

Status: implementation handoff for the existing draft PR #148. Do not merge or deploy until Hark's review and desktop/mobile QA are complete.

## Goal

Turn the existing shared Graveyard blockout and carried inventory into a readable scavenging loop without replacing the current Three.js runtime, account-save format, authenticated API, or server-authoritative action rules.

## Current foundations

- The server owns expedition position, survival values, inventory, encounter health/damage, rewards, and resource costs.
- Carried inventory has stack/weight limits and refuge stash/withdraw flows.
- The Graveyard scene already renders POI markers and accepts server-clamped movement.
- Loot and interaction must extend these foundations; never trust client-submitted loot, distance, cooldown, account ID, or reward amounts.

## Implementation sequence

### Completed: world loot nodes and visible 3D interaction

Implemented in this branch:

- Eight authored shared-world nodes cover the bus depot, river checkpoint, wrecked depot, rail yard, market, hospital, ironworks, and research annex.
- The server owns weighted drop tables, node cooldowns, accepted inventory quantities, and overflow. Clients submit only the stable node ID.
- The API verifies expedition membership and a 9-unit server-side interaction radius. Shared node cooldown state is persisted and malformed/legacy state is normalized.
- The Graveyard renders clickable procedural supply containers. Selecting one does not move the player; a separate **Search selected container** action collects it.
- Players receive explicit results for collected supplies, full-pack overflow, out-of-range attempts, and nodes already searched.
- Added `server/homefront-loot.test.js` for valid claims, unknown IDs, range enforcement, cooldowns, legacy normalization, and capacity overflow. The test is wired into `npm run test:homefront`.
- The interaction uses Homefront's existing vendored Three.js raycaster and no new runtime dependency. See `docs/homefront-open-source-survival-adaptation.md` for source references and license policy.

### Next implementation focus

Improve the field inventory interface and complete the end-to-end expedition loop. Keep the current server as the authority for every item action and test on desktop and mobile before Hark reviews the branch.

### 3. Inventory UI pass

Expose the carried pack clearly during expeditions: item counts, used weight/capacity, stack limits, and quick actions for eat, drink, bandage, and stash on return. Disable actions that cannot succeed, but still validate every action on the server. Make touch targets comfortably sized and preserve readable contrast at narrow widths.

### 4. Food and water quality

Add this only after physical loot claims are stable.

- Give food and water item variants explicit IDs rather than trusting arbitrary client item strings.
- Keep clean water usable immediately; dirty water must never be silently treated as clean.
- Add a refuge purification/cooking interaction with explicit resource/time costs and server-side validation.
- If spoilage is implemented, store bounded timestamps or freshness values per stack/batch and migrate legacy integer-only inventories without deleting items.
- Keep initial spoilage gentle and transparent; do not punish offline players with surprise total inventory loss.
- Add tests for legacy migration, expired food, purification costs, insufficient materials, and duplicate actions.

### 5. Test and release gate

Before marking the pass ready for Hark:

1. Run `npm ci`.
2. Run the Homefront settlement, world, inventory, survival, combat, asset-integrity, airport/flight-lobby, and Blacktide focused tests.
3. Run Node syntax checks for changed server modules and module syntax checks for changed browser scripts.
4. Verify authenticated API actions with two distinct accounts and confirm one account cannot inspect or mutate another's private refuge/inventory.
5. Play through a complete loop: leave refuge with supplies → travel (hunger/thirst/stamina change) → search a physical loot node → collect into the pack → encounter infected and spend carried ammo/medical supplies → return → auto-stash accepted supplies.
6. Test narrow mobile viewport, touch selection, disabled WebGL fallback behavior, loading/errors, and reconnect/reload persistence.
7. Keep PR #148 in draft, unmerged, and undeployed until Hark has reviewed the implementation and QA results.

## Open-source integration policy

Continue adapting compatible patterns rather than wholesale-copying a game. Keep attribution and license notes beside any vendored asset or borrowed implementation. Prefer the existing vendored Three.js stack and locally bundled assets; do not add remote runtime dependencies. Recheck each asset's exact license and source before adding it.
