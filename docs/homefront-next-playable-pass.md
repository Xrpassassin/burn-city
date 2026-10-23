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

### Completed: authoritative combat handling pass

Implemented on the existing draft branch:

- A server-owned aim stance is toggled through the authenticated `/api/homefront/world/aim` endpoint. A client-submitted 3D aim point cannot grant precision damage unless the server confirms the player has held the aim stance through the weapon's ADS time.
- Weapon-specific handling profiles define ADS duration and recovery behavior for the Pipe Blade, Pump Shotgun, Marksman Rifle, and Shock Maul. The marksman rifle deliberately takes longest to settle.
- Aiming slows accepted movement using a server-side per-weapon movement budget. Movement lowers the weapon and starts a recovery window.
- Sprint travel is explicit, remains bounded by server movement/pathfinding, costs additional stamina, and records a longer accuracy-recovery window. Sprinting while the server still considers the weapon raised is rejected until the client lowers it.
- Combat responses expose server-calculated aim stability, ADS progress, and whether the shot was truly aimed. The UI reports settling/ADS feedback and offers a sprint travel toggle.
- Added regression coverage for ADS gating, forged aim points, weapon-specific ADS timing, aiming movement penalties, sprint bounds, and post-sprint precision recovery.

This remains a click-to-travel 3D prototype rather than continuous WASD movement; the handling pass improves the existing action loop without replacing the runtime.

### Completed: field inventory UI pass

- Field inventory cards now show per-item counts against stack limits, item weight, and stack fill. The pack header highlights when total weight reaches capacity.
- Pack actions disable when the refuge lacks the requested quantity or the carried pack cannot fit the whole requested transfer. Stashing disables when the pack is empty.
- Eat, drink, bandage, rest, cook, and purify controls remain context-gated and server-validated. The existing large touch targets and dark high-contrast layout are preserved.

### Completed: preserve food and water quality across storage and packing

- Refuge saves now normalize explicit `rawFood` and `dirtyWater` resource buckets while retaining legacy integer-only saves and their existing clean/cooked counts.
- Stashing or returning an expedition no longer silently converts raw food into cooked rations or contaminated water into potable water. Quality variants remain distinct in the refuge resource ledger.
- Added separate field-kit actions for packing raw food and dirty water from refuge stores, with distinct labels and explicit insufficient-stock feedback. The settlement resource ledger now labels cooked rations, raw food, clean water, and dirty water separately.
- Existing field cooking and purification routes still require one unit of wood as fuel and consume the appropriate raw input; they create one cooked ration or clean water only after capacity and material checks succeed.
- Added regression coverage for quality-preserving stash behavior. Freshness/spoilage timers remain a separate follow-up: no offline spoilage is applied yet, so legacy supplies are not unexpectedly destroyed. Before spoilage is added, inventory mutation helpers must preserve per-batch timestamps and migrate legacy integer-only stacks without refreshing old stock on every request.

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
