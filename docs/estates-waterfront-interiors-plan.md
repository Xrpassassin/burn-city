# Estates Island: fishable waterfront and larger-on-the-inside properties

## Existing integration points
- `estates-island-scene.mjs`: public island manifest, bridge, roads, lots, water ring and dock.
- `estates-island-renderer.mjs`: Three.js scene meshes; water currently visual, not a fishing simulation.
- `estates-island-runtime.mjs` and `estates-entry-adapter.mjs`: explicit city-to-island transition.
- Existing city fishing rules and server-side catch validation should be reused, not forked.

## Target topology
The city bridge leads to a **public** Estates Island instance. The island has a continuous surrounding lake, accessible shoreline fishing stations, and a public pier. Every estate has a visible exterior and a doorway trigger. Doorways lead to separate interior instances; interior dimensions are not constrained by the exterior footprint. An interior exit returns the player to that estate's doorway, not the city's main entrance.

## TARDIS-style interiors
An interior is a separate scene with its own world coordinates, camera bounds, streaming budget, and optional floors. Interior templates are tier-dependent, with room for future customization. Exterior appearance and interior scale are intentionally decoupled. Server-verified property ownership/invitations govern private entry; public roads, shoreline, and docks remain accessible without property ownership. Never accept `authorized:true` supplied by the browser as proof; the pure helper's authorization argument is only a downstream result of server verification.

## Fishing
The new `estates-waterfront-contract.mjs` supplies coarse spatial checks for UI/casting previews, not server truth. The island shoreline radius and water ring are currently approximate/elliptical in the renderer; **do not enable live fishing using these radial checks alone**. First implement a shared shoreline/water polygon or signed-distance model from the scene manifest, verify bridge/dock positions, and reconcile water height. Then connect casting to existing rod, bait, bite, reel, inventory, and server-authoritative reward pathways. Casts from shore and public docks should be possible; swimming and boats remain separate milestones.

## Visual build sequence
1. Make island shoreline and lake water geometrically continuous, including the bridge approach and shoreline collision; avoid visible rectangular or ring seams.
2. Add accessible public fishing banks, a pier, reeds, rocks, shoreline trees, lighting, and water animation with mobile LOD.
3. Replace tier building blockouts with exterior kits; add door triggers and loading/return transitions.
4. Implement instance-specific interiors with larger floor plans, stairs/floors and collision. Stream interior assets only on entry.
5. Wire server-side access checks, synchronized fishing, and two-client regression tests.
6. Mobile smoke test: bridge crossing, island entry/exit, water casting, property access denial, interior exit and frame time.

## Acceptance gates
- A visitor can walk the public island and fish without owning a property.
- Water surrounds the island without shoreline holes or casts on dry land.
- The same fishing inventory/economy is used across City and Estates.
- A small exterior can open into a much larger interior without camera/collider bleed.
- Unauthorized users cannot enter a private estate via forged client messages.
- Two players see consistent catches, occupancy and return locations.
- No runtime integration or deployment is claimed by this contract-only PR.
