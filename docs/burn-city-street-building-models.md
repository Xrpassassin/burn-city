# Ordinary street building exterior pilot

Use [Sci-fi building 7 by Scarecrow_original](https://sketchfab.com/3d-models/sci-fi-building-7-b26b4ace15bd48259fcf235d31eec7c8) ([share link](https://skfb.ly/otDHA)) for three to five ordinary street buildings on one block. The listing offers a free [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) download and reports approximately 4,200 triangles and 4K textures. Verify the archive, materials, dimensions, and orientation before export.

## Preserve the existing city

- In [app.js](../client/js/app.js), select only ordinary entries marked `infill: 1` in `sats`. Use a deterministic subset on one accessible street. Exclude token towers, holder and district satellites, shops, service buildings, Estates, and any building with an entrance or other interaction.
- Reuse each selected lot's position, street rotation, footprint, height, and collision proxy. Normalize the model's origin to ground level and fit it inside the existing lot envelope. Skip lots where the silhouette would require stretching or cause an overhang into sidewalks or roads.
- Keep procedural visuals as the fallback. Replace the selected lots' visual instances only after the imported mesh is ready. Account for their facade segments, trims, signs, rooftop props, and beacon geometry together so the original parts do not float or clip through the new model. Keep original procedural generation and random sampling stable for surrounding lots. Give reviewers a simple way to switch between original and imported exteriors.
- Follow the local glTF and instancing patterns in [cityprops.mjs](../client/js/cityprops.mjs). Share the mesh and materials across copies. Start with downscaled textures on phones and load the optional visual asset independently from city startup. Add the title, artist, source, license, and modification notes to the generated [city credits](../client/city-credits.html).

## Keep later additions consistent

Treat this model as the first exterior in a small set. Keep model selection separate from lot placement. When more exteriors arrive, give each one its own asset reference, normalized bounds, frontage orientation, and credit. Use the existing deterministic lot selection to vary them. Aim for related industrial sci-fi silhouettes, subdued metal and concrete, and restrained accent lights so the block fits Burn City and nearby buildings do not all look identical.

## Check before merge

- [ ] Compare street-level and Orbit views from the same camera positions. Verify the fitted buildings sit on the ground, face the street, and leave sidewalks and vehicle lanes clear.
- [ ] Walk around the selected block on desktop and phone. Check for visible geometry beyond collision, invisible barriers where the building used to be, and leftover signs or rooftop pieces.
- [ ] Disable the new models and simulate an asset load failure. Verify the original buildings, surrounding placements, and city startup still work.
- [ ] Compare mobile frame time and texture requests. Confirm the in-game credit and spot-check BURN Tower entry and nearby shops.
