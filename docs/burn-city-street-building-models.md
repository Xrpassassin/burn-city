# District-specific street building exteriors

Give each participating Burn City token district one recognizable building model for its ordinary street buildings. Keep the landmark tower and the district's existing layout and gameplay. All seven models below are supplied by Scarecrow_original under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Verify the model identity, license, and downloaded archive before importing.

| District or assignment | Exterior |
| --- | --- |
| BURN | [Sci-fi building 7](https://skfb.ly/otDHA) |
| IMM | [Sci-fi Building 10](https://skfb.ly/otFwy) |
| XRPyro | [Sci-fi Building 11](https://skfb.ly/otGBq) |
| Next eligible district | [Sci-fi Building 4](https://skfb.ly/otyxv) |
| Next eligible district | [Sci-fi Building](https://skfb.ly/otu6O) |
| Next eligible district | [Sci-fi Building 6](https://skfb.ly/otAJP) |
| Next eligible district | [Sci-fi Building 5](https://skfb.ly/otyZw) |

BURN's Building 7 assignment is fixed. IMM and XRPyro are proposed assignments for review. Rank the BURN ecosystem's existing token districts by market cap first, then use remaining models on the highest-market-cap other built token districts. Use the city data's XRP-denominated `mcap` with `mcap_amm` as the fallback, as in [app.js](../client/js/app.js). Confirm ecosystem membership and use the latest available snapshot at assignment time. Record its date and assigned districts in the PR. Leave unrankable districts or districts without a dedicated model on procedural exteriors. Freeze the model mapping by token identity once assigned so market movements affect future rollout priority while existing neighborhoods keep their visual identity.

## Replace the ordinary buildings around each tower

- In [app.js](../client/js/app.js), district fillers are ordinary `sats` entries with `s.n` pointing to a token node and no `s.holder`. These are the primary replacement targets. The `infill: 1` entries have `n: null` and are generated between districts. Leave shared infill procedural unless it can be assigned unambiguously to one district using the existing district layout. Exclude token towers, holder buildings, shops, service buildings, Estates, and any lot with an entrance or interaction.
- Validate three to five BURN lots around the tower first. After the pilot, apply Building 7 to the eligible BURN fillers throughout the district and roll out each other district with its assigned model. Keep each model exclusive to its district. Use scale within each existing lot, street-facing orientation, and subtle accent color or material variation to make repeating silhouettes feel natural while keeping the industrial sci-fi style consistent.
- Reuse lot positions, street orientation, footprint, height, and collision. Normalize model origins to ground level and fit inside the lot envelope. Keep the procedural exterior on lots where the new silhouette cannot fit without clipping or creating a collision mismatch. Leave streets, paths, and nearby interactable buildings in place.
- Swap the selected lots' facade segments, trims, signs, rooftop props, and beacons together once the asset is ready. Preserve procedural placement and random sampling for neighboring lots. Keep a simple way to compare against procedural exteriors and allow per-model fallback when an asset fails to load.
- Follow the local glTF and instancing patterns in [cityprops.mjs](../client/js/cityprops.mjs). Share mesh and materials across copies, use downscaled textures on phones, and load district exteriors independently from city startup. Add each title, artist, source, license, and modification notes to the generated [city credits](../client/city-credits.html).

## Check before merge

- [ ] Compare the BURN pilot from street level and Orbit on desktop and phone. Walk and drive around the lots and check that the models fit their collision, leave the sidewalk clear, and show no leftover procedural props.
- [ ] Verify each assigned district uses its own model across eligible lots. Check boundaries and shared roads for duplicate assignments, and verify a market-cap refresh leaves existing assignments stable.
- [ ] Disable imported exteriors and simulate one asset load failure. Check that each affected lot falls back and other districts still render.
- [ ] Compare phone frame time and texture requests. Verify credits and spot-check tower entry, nearby shops, holder visuals, and the original district layout.
