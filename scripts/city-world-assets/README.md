# City terrain, sky and aircraft imports

The manifest records the source UIDs, attribution and first-pass optimization targets. Source triangle counts are rounded listing figures. Runtime budgets are starting targets for preview profiling. A zero triangle target means to reuse the existing sky geometry and extract only the surface or sky artwork.

Use the authorized Sketchfab connection to download each source by UID. Stage one `<id>.glb` or `<id>.gltf` per model in a local folder outside the repository. For glTF, keep the original relative buffers and images beside the file. Inspect a batch with Blender:

```sh
blender -b --python-exit-code 1 -P scripts/city-world-assets/inspect_downloads.py -- \
  --source-dir /path/to/staging --report /tmp/burn-city-world-assets.json crj-900 airplane
```

Omit the model IDs to inspect all manifest entries. The report records scene bounds, triangles, object hierarchy, materials, texture sizes and animation actions. Use Blender to confirm material appearance and pivots visually. Match the source UID and license to the downloaded archive and carry the credit and any modifications into `client/city-credits.html` when committing optimized derivatives.

## Integration order

1. **Airport aircraft.** Start with the CRJ-900 on the parked gates and moving airport aircraft in `client/js/airport.js`. Keep the gate occupancy, taxi and runway paths, navigation lights and flight updates. Align the aircraft's nose with the airport's +Z convention and place the wheels at the runway plane. Review the CityJet livery for the game, and apply a BURN City livery if it needs replacing. Check the second aircraft's silhouette and markings before assigning a role. Test parking, taxi, takeoff, landing and view distance on desktop and mobile.
2. **Sky.** Extract a lunar surface texture and use it in the moon phase rendering in `client/js/app.js`. Bake the Sun artwork into a small disc texture, driven by the existing sun direction. Use the constellation art as a night-only layer on the current sky sphere. Inspect the export to determine its projection and avoid double stars where the art already includes them. Check dawn, full daylight, dusk, night, storms and the view from Estates. Keep the weather and lighting uniforms in charge.
3. **Canyon.** Crop the most recognizable ridgeline and rock faces and decimate them for a distant scenic mesh. Preserve the source elevation and imagery credit alongside the Sketchfab attribution. Begin with one horizon sector beyond the playable city, using the existing mountain ring as a fallback. Check skyline composition from the ground, tall buildings, the airport and Estates. Expanding this into a traversable area would require separate terrain and collision work.
4. **Lynx.** Optimize the photogrammetry fuselage and inspect whether both rotors are separable. If baked into the scan, separate or rebuild the visible rotor meshes around their own pivots. Preview at the airport first. For an Estates flight model, use the visual as a child of the existing craft group in `client/js/estates-helicopter-world.mjs`. Check footprint, landing clearance, rotor spin, camera and material paint slots before making it an owned aircraft visual.

Keep the procedural visuals available while each replacement loads. Use a simplified instanced model for repeated parked aircraft and defer high-detail downloads until the model can be seen up close. Record optimized file size, draw calls and frame time in the preview before enabling a new model by default.

## CB1, ISS and the Cosmodrome zombie

Launch the orbital flight preview at `client/space/index.html` or use the airport expedition kiosk with `?spacePreview=1` on the City page. Launch, align the ship, hold Approach to dock, then return to the City. The airport entry uses the existing return-position snapshot. Docking currently ends the preview flight.

Download CB1 and ISS through the authorized Sketchfab connection. Run the same Blender inspection command with the IDs `cb1 iss`. The CB1 listing is marked NoAI. Use ordinary Blender editing and export for the game models.

- **CB1** · Inspect the six listed clips. Retain useful local motion such as hatches or landing gear if those are present. Export `client/assets/space/cb1.gltf` with external local buffers and textures. The preview expects an approximately 1.35-unit hull centered at the craft root, nose forward along −Z, and docking contact at about Z −0.675.
- **ISS** · Isolate the station exterior first. Inspect the bundled Earth and astronaut materials separately. Export `client/assets/space/iss.gltf` with its port facing +Z at local `(0, 0, .75)`, matching the preview docking ring. Aim for an approximately 11-unit wingspan in the preview framing.
- Enable the matching keys in `client/assets/space/models.json` when committing each optimized export and its actual credit in `client/city-credits.html`. The scene will keep its procedural representation if the local export cannot load. Check alignment from the cockpit camera angle and profile both models together on mobile.
- **SCP-096** · The Ashen Cosmodrome containment encounter can be previewed on a test server with `ZOMBIE_CONTAINMENT_PREVIEW=1`. It uses the existing thin infected model or procedural fallback until the exact SCP-096 art is cleared. The encounter appears as the first spawn on waves 10, 14, 18 and so on in Free Play. Preserve the Ashen Warden and the ranked/daily rosters. Before redistributing this exact upload, verify the terms for Victor Tomioka’s mesh and Shakles’s animations. The uploader lists CC BY 4.0, while the [SCP: Unity archive](https://www.scp-unity.com/) says some creator-owned assets are excluded from its general ShareAlike release. The [SCP Wiki licensing guide](https://scp-wiki.wikidot.com/licensing-guide) also describes attribution and ShareAlike for SCP-derived work. After verifying the exact files, inspect Idle, Walk, Run, Attack and Death, remove horizontal root motion, and hook the approved export into the original Zombies model renderer. If the specific export terms remain unclear, use an independently authored infected mesh and clips for the encounter.
