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

## Exterior-to-expanded-world illusion (confirmed design)
Keep every existing estate exterior at ordinary neighborhood scale. Do not enlarge the island or exterior meshes to fit an interior. A property entrance is a spatial transition gateway: walking to the front door shows an interaction prompt, the host requests server-verified entry rights, then loads a property-scoped interior world whose coordinates, dimensions, lighting, terrain and scene streaming are independent of the exterior. The entry animation/loading veil should hide the scene swap. This is the same broad separate-region pattern used for Cinderwilds, not physically impossible geometry inside a single Three.js scene.

- **Exterior**: public shared neighborhood, visible realistic homes, address and door anchor; do not expose interior geometry or occupants through exterior walls.
- **Interior**: one persistent property identity with its own scene and instance/session; spacious rooms, multiple floors, and later private gardens or expansions. Template and capacity are tier-specific, but interior dimensions need not correspond to house footprint.
- **Return**: save the property door's exterior return anchor before transition; exiting, disconnect recovery and invalidated access must restore a safe exterior position, not strand a player inside.
- **Visitors**: invitations are server-verified and revocable; multiple authorized players entering the same estate should share the intended instance and synchronized state, rather than each seeing unrelated copies.
- **Safety**: client-selected propertyId/interiorId/authorized booleans never grant access. Validate property membership, capacity, invitation expiry, and instance binding on the server; enforce movement/collision bounds in the loaded world.
- **Performance**: load the interior on demand, unload exterior-heavy assets while inside when appropriate, and clean up controls/audio/physics when switching. Use a lightweight transition screen to prevent visible pop-in.
- **Tests**: small exterior versus large interior dimensions, unique property instance keys, enter/exit anchor fidelity, invitation denial/revocation, two-player synchronization, reconnect recovery, and mobile asset cleanup.

Acceptance: walking along the island still looks like a conventional neighborhood; entering an ordinary house reveals an independently sized, immersive property world. Neither the public island nor its fishable shoreline depends on the interior instance being loaded.

## Corrected primary world boundary — Estates Island is the expanded instance
**Product requirement superseding earlier per-house emphasis:** The small-looking Estates entrance/neighborhood frontage in the BURN City main world is the gateway. Crossing it transports the player into **one separate, much larger Estates Island world**, including all estate properties, streets, landscaping, shoreline, surrounding water, docks and fishing. The island's dimensions are deliberately independent of the visual footprint of its gateway in the city. This is the main TARDIS illusion.

- Main BURN City: keep the compact, believable Estates frontage/entrance. Do not render the full island at city-world scale or require spatially continuous lake geometry between worlds.
- Gateway: explicit enter/exit trigger with transition/loading veil, return anchor, authenticated player handoff and reconnection recovery. No property ownership required for access to public island.
- Estates Island instance: shared destination world for all visitors, with independent world coordinates, terrain, full neighborhood and fishable surrounding water. All property exteriors exist inside this same island world.
- Individual houses: **do not require per-house instances for this milestone**. Ordinary property interactions and optional interiors can be developed later. Do not gate island completion on private interiors.
- Fishing: the island's own water geometry and valid casting points feed into existing server-authoritative fishing/inventory systems; never award catches from local-only geometry checks.
- Acceptance: a small city gateway leads to a significantly larger navigable island; multiple players arrive in the same intended island world, can visit its public waterfront, and return to the city entrance. The city does not need to contain the island's actual geographic footprint.

Earlier discussion of oversized individual property interiors is a possible *future feature*, not the defining requirement for this build. Prioritize island scale, water and fishing, island navigation and seamless transitions.

## Elastic Estates world — capacity expansion
The gateway in BURN City is a stable, compact visual facade; its footprint never constrains the separate Estates Island world. Estates Island may eventually be geographically larger than the main city. Expansion is driven by confirmed demand/capacity planning, not by trusting a browser purchase event.

- Partition the shared island world into stable district IDs and terrain chunks. Maintain a persistent central district for gateway arrival, public roads, fishing shoreline and amenities.
- Reserve adjacent district connections (roads, bridges, ferries, shoreline paths) so added land does not invalidate existing addresses, property boundaries, spawn points or purchased lots.
- Allocate lots from a versioned, server-owned registry with property IDs, tier, district, parcel bounds, access rules and immutable ownership history. Prevent double allocation; validate wallet settlement on the server before activating a purchased parcel.
- Larger estate tiers can consume larger parcels; demand thresholds can trigger server-approved new districts. Do not promise an infinite world or automatically mint new property supply on a client signal.
- Stream chunks near players and use distance LOD, instancing, pooled assets, collision activation and interest-managed multiplayer updates. Do not keep every property and all occupants rendered or simulated for each client.
- Extend terrain and fishable water with a shared coastline/water mask, valid casting geometry and server-authoritative fishing. New districts must not leave dry-land casts, water seams, or inaccessible shorelines.
- Preserve the single shared Estates destination and recognizable city gateway. Capacity-based server shards are a future operational option only if a single instance cannot scale, with deliberate social continuity rules.
- Test district additions against saved player return anchors, existing lot coordinates, shore geometry, fishing, navigation, mobile performance, and two-player visibility.

Milestones: fixed initial island -> chunk registry and reserved expansion edges -> first additional residential district -> demand-driven parcel activation -> optional secondary islands. No production expansion is claimed by this plan.
