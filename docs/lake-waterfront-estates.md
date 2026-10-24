# Lake expansion and Waterfront Estates

## Scope
This branch expands the existing procedural lake and replaces the isolated construction-lot presentation with a separate tiered Waterfront Estates district across the water. It is deliberately independent of other open pull requests and does not merge to `main`.

## Implementation
- Enlarges the lake's half-width from 175 m to 210 m and half-depth from 62 m to 78 m (about 20% wider and 26% deeper).
- Updates the water shader's normalized coordinates to match the geometry, preserving the organic shoreline, animated surface, reflections approximation, ripple hooks, fish-shadow hooks, and low-tier geometry choice.
- The existing lake-frame placement logic automatically pushes the far shore and Estates farther from the city as the lake grows.
- Replaces the single fenced construction site with a separate residential district: two trailer-home models, one low-rise apartment building, two two-bedroom starter homes, two four-bedroom family homes, and two luxury lakefront mansions, plus plots, driveways, internal roads, sidewalks, boulevard lighting, and a city-facing entrance sign.
- Adds a shared pocket park with walking paths, planted flower beds, benches, picnic tables, bins, and a simple play area.
- Adds merged low-poly street/perimeter trees, shrubs, private-yard fencing, and mailboxes to give the neighborhood more natural variation and lived-in detail.
- Places lower-cost housing nearer the city-facing entrance and reserves the lakeward side for larger family homes and premium mansions; apartments use repeated window/balcony geometry and trailers use compact manufactured-home silhouettes.
- Updates the Estates interaction card to describe the housing tiers while clearly noting that rent, purchases, interiors, and ownership progression are not implemented.
- Adds three moving, visible feeding-school rings on the lake. Casting within a school shortens the wait for a bite and widens the reel timing zone; the effect is a gameplay-quality bonus only and does not change server-authoritative fish species or award extra currency.
- Uses the project's existing Three.js geometry and `BufferGeometryUtils.mergeGeometries` patterns for trees and amenities. No new dependency or downloaded third-party asset is added; this avoids introducing an unverified asset license or extra mobile payload. Open-source procedural tree generators were reviewed as possible future sources, but no incompatible WebGPU/alpha library was imported into the current rendering path.
- Retains the existing estate interaction target and exported lake/road metadata.

## Fishing gameplay pass (Oct 23, 2026)
- Feeding schools move slowly to new valid water coordinates and pulse visually above the lake surface.
- A cast landing within 9 m of a school gets a 1.28× timing-zone bonus and a 22% shorter bite wait, with a 1.4 s minimum.
- Bonus calculation is isolated in `client/js/fishing-rules.mjs` and has deterministic boundary tests.
- No third-party game code was copied. The feature uses the repository's existing Three.js runtime; MIT-licensed TIDELINE was reviewed as a design reference, not imported, because its full game loop does not fit this client architecture.

## Validation required before merge
1. Run repository CI and JavaScript syntax checks.
2. Open the city in desktop and mobile layouts; confirm the water mesh and shader boundary line up.
3. Verify fishing/ripples, lake avoidance/collision, bridge deck/guard, road approach, and estate interaction.
4. Check the entrance sign faces the city and the internal boulevard joins the bridge without a gap.
5. Inspect mobile frame time and GPU memory; reduce tree/lighting detail if needed.
6. Verify the pocket park, playground props, fences, and mailboxes do not overlap walkable paths or block character movement.
6. Review all changed files alongside Hark's pending changes before merging.

## Follow-up opportunities
- Implement rent/purchase pricing, individually selectable plots, ownership persistence, and interiors after the current interaction/economy model is established.
- Add boats, shoreline props, and a future player-customizable home system in separate, testable changes.
- Server-synchronize traffic as a separate feature; this branch intentionally does not claim to synchronize the current client-local traffic animation.
