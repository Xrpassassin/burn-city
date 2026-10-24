# Estates architecture pass

The Estates district uses the project's existing Three.js runtime and procedural geometry rather than downloaded model packs. This keeps the district self-contained, avoids adding external asset licensing obligations, and lets the same stable property IDs continue to drive inspection and future ownership integration.

## Current architectural tiers

- **Trailer homes:** compact manufactured-home footprints, wheel details, simple roofs, front glazing, trim, private yard edges and mailboxes.
- **Apartment block:** three visible floors of repeated glazing, tier-specific color belt-lines, balcony slabs/rails, a lobby entrance and a flat modern roof.
- **Starter homes:** pitched twin-panel roofs with gable ends, fascia, window frames, selected warm-lit windows, distinct entry doors, porch canopy/columns, steps and garage panel seams.
- **Family homes:** larger pitched-roof silhouettes and wider facade proportions, with the same readable entry/garage details.
- **Lakefront mansions:** taller roof ridge and gables, broad arrival terrace, premium trim, warm exterior marker lights, sun loungers and a pool deck/water surface placed beyond the terrace toward the lake.
- **Neighborhood dressing:** existing sidewalks, driveways, planted beds, trees, fences, park furniture, streetlights and the district entrance sign remain part of the scene.

## Rendering and gameplay boundaries

Repeated building details are merged into material batches to control draw calls. Tier color bands use vertex colors in a single merged mesh. The build uses Three.js geometry primitives already bundled in the repository; no new runtime dependency or third-party model download is required.

The buildings are still environmental exterior models. Interior navigation, doors that open, furnishing, construction upgrades, collision/occlusion tuning and purchasable ownership are separate follow-up tasks. Existing invisible raycast targets and stable property IDs remain in place for inspection.
