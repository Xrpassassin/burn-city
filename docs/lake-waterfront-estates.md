# Lake expansion and Waterfront Estates

## Scope
This branch expands the existing procedural lake and replaces the isolated construction-lot presentation with a separate four-home Waterfront Estates district across the water. It is deliberately independent of other open pull requests and does not merge to `main`.

## Implementation
- Enlarges the lake's half-width from 175 m to 210 m and half-depth from 62 m to 78 m (about 20% wider and 26% deeper).
- Updates the water shader's normalized coordinates to match the geometry, preserving the organic shoreline, animated surface, reflections approximation, ripple hooks, fish-shadow hooks, and low-tier geometry choice.
- The existing lake-frame placement logic automatically pushes the far shore and Estates farther from the city as the lake grows.
- Replaces the single fenced construction site with a separate residential district: four modern house forms, plots, driveways, internal roads, sidewalks, landscaping, boulevard lighting, and a city-facing entrance sign.
- Uses the project's existing Three.js geometry and `BufferGeometryUtils.mergeGeometries` patterns. No new dependency or downloaded third-party asset is added; this avoids introducing an unverified asset license or extra mobile payload.
- Retains the existing estate interaction target and exported lake/road metadata.

## Validation required before merge
1. Run repository CI and JavaScript syntax checks.
2. Open the city in desktop and mobile layouts; confirm the water mesh and shader boundary line up.
3. Verify fishing/ripples, lake avoidance/collision, bridge deck/guard, road approach, and estate interaction.
4. Check the entrance sign faces the city and the internal boulevard joins the bridge without a gap.
5. Inspect mobile frame time and GPU memory; reduce tree/lighting detail if needed.
6. Review all changed files alongside Hark's pending changes before merging.

## Follow-up opportunities
- Add individually selectable/purchasable estate plots only after the current interaction/economy model is established.
- Add boats, shoreline props, and a future player-customizable home system in separate, testable changes.
- Server-synchronize traffic as a separate feature; this branch intentionally does not claim to synchronize the current client-local traffic animation.
