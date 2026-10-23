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

### 1. World loot nodes

Add deterministic, authored loot nodes to the shared Graveyard world, keyed by stable IDs and associated with existing districts/POIs. A node should expose only its public identity, position, display name, category, and whether it is available. The server owns the actual loot table, cooldown, and claim result.

- Initial categories: food, clean water, medical supplies, ammunition, scrap, and wood.
- Locations: bus depot, river checkpoint, wrecked depot, rail yard, hospital, market, and ironworks.
- Higher-risk districts can offer better weighted loot, but never guarantee premium drops.
- Persist node cooldowns in the existing shared-world save. Normalize malformed/legacy values safely.
- A successful claim must verify the player is in an expedition and within a small server-calculated interaction radius of the exact node.
- Resolve claims atomically against the latest world state so two players cannot claim the same shared node.
- Add a short global cooldown for shared caches and separate per-node/per-player cooldowns only where explicitly designed.
- Add tests for out-of-range claims, unknown IDs, repeated claims, concurrent/shared claims, inventory-full overflow, cooldown expiry, and account isolation.

### 2. Visible 3D pickup and interaction

In `client/arena/homefront-graveyard-3d.js`, render simple low-cost pickup props at the authored node coordinates (crates, backpacks, medical cases, water containers, scrap piles). Keep labels legible on mobile and provide a clear selected/nearby interaction state.

- Ground clicks continue to move the player.
- Clicking a loot prop selects it rather than accidentally issuing a movement command.
- Show an explicit **Search / Collect** action; do not collect merely by looking at or walking near an item.
- On collection, call the authenticated server endpoint with the stable node ID only.
- The server response is the sole source of the item quantities, capacity/overflow result, and node cooldown.
- Refresh the scene from the returned world snapshot. Show feedback such as “+2 food, +1 water” or “Pack full — remaining supplies left at refuge.”
- Use procedural meshes as the fallback; do not add an external asset CDN or a new runtime dependency.

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
