# City terrain, sky and aircraft imports

The manifest records the seven source UIDs, attribution and first-pass optimization targets. Source triangle counts are rounded listing figures. Runtime budgets are starting targets for preview profiling. A zero triangle target means to reuse the existing sky geometry and extract only the surface or sky artwork.

Use the authorized Sketchfab connection to download each source by UID. Stage one `<id>.glb` or `<id>.gltf` per model in a local folder outside the repository. For glTF, keep the original relative buffers and images beside the file. Inspect a batch with Blender:

```sh
blender -b --python-exit-code 1 -P scripts/city-world-assets/inspect_downloads.py -- \
  --source-dir /path/to/staging --report /tmp/burn-city-world-assets.json crj-900 airplane
```

Omit the model IDs to inspect all seven. The report records scene bounds, triangles, object hierarchy, materials, texture sizes and animation actions. Use Blender to confirm material appearance and pivots visually. Match the source UID and license to the downloaded archive and carry the credit and any modifications into `client/city-credits.html` when committing optimized derivatives.

## Integration order

1. **Airport aircraft.** Start with the CRJ-900 on the parked gates and moving airport aircraft in `client/js/airport.js`. Keep the gate occupancy, taxi and runway paths, navigation lights and flight updates. Align the aircraft's nose with the airport's +Z convention and place the wheels at the runway plane. Review the CityJet livery for the game, and apply a BURN City livery if it needs replacing. Check the second aircraft's silhouette and markings before assigning a role. Test parking, taxi, takeoff, landing and view distance on desktop and mobile.
2. **Sky.** Extract a lunar surface texture and use it in the moon phase rendering in `client/js/app.js`. Bake the Sun artwork into a small disc texture, driven by the existing sun direction. Use the constellation art as a night-only layer on the current sky sphere. Inspect the export to determine its projection and avoid double stars where the art already includes them. Check dawn, full daylight, dusk, night, storms and the view from Estates. Keep the weather and lighting uniforms in charge.
3. **Canyon.** Crop the most recognizable ridgeline and rock faces and decimate them for a distant scenic mesh. Preserve the source elevation and imagery credit alongside the Sketchfab attribution. Begin with one horizon sector beyond the playable city, using the existing mountain ring as a fallback. Check skyline composition from the ground, tall buildings, the airport and Estates. Expanding this into a traversable area would require separate terrain and collision work.
4. **Lynx.** Optimize the photogrammetry fuselage and inspect whether both rotors are separable. If baked into the scan, separate or rebuild the visible rotor meshes around their own pivots. Preview at the airport first. For an Estates flight model, use the visual as a child of the existing craft group in `client/js/estates-helicopter-world.mjs`. Check footprint, landing clearance, rotor spin, camera and material paint slots before making it an owned aircraft visual.

Keep the procedural visuals available while each replacement loads. Use a simplified instanced model for repeated parked aircraft and defer high-detail downloads until the model can be seen up close. Record optimized file size, draw calls and frame time in the preview before enabling a new model by default.
