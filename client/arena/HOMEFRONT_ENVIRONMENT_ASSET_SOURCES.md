# Homefront environment asset intake plan

This is a sourcing and integration plan for Homefront's 3D environment. It does not download third-party files or change the live renderer by itself. Import selected assets only after checking the actual archive, format, license, scale, polygon count, texture sizes, and mobile performance.

## Priority source shortlist

| Priority | Source | Best candidates | License posture | Planned use |
|---|---|---|---|---|
| P0 | [ModKit modular building kit](https://github.com/JaronKBragg7337/asset-pack-ue-threejs-blender-unity) | Straight/half/damaged/reinforced walls, corners, doorways, windows, stairs, roofs, pillars, railings, rubble, crates, barrels | Repository describes the pack as CC0; preserve source metadata and verify archive contents | First wall/barricade kit pilot; GLB is a preferred format |
| P0 | [Kenney Building Kit](https://www.kenney.nl/assets/building-kit) | Modular wall segments, corners, windows, doors, floors, stairs, roofs | Kenney assets are commonly CC0; verify the specific pack's license file | Repeatable building shells and interiors |
| P0 | [Kenney City Kit — Suburban](https://kenney.nl/assets/city-kit-suburban) | Houses, shops, neighborhood structures | Verify pack-specific license and format | Starter streets and residential districts |
| P0 | [Kenney City Kit — Roads](https://kenney.nl/assets/city-kit-roads) | Road lanes, junctions, sidewalks, crossings | Verify pack-specific license | Connected street layout and navigation landmarks |
| P1 | [Kenney City Kit — Industrial](https://kenney.nl/assets/city-kit-industrial) | Warehouses, industrial buildings, factory-like structures | Verify pack-specific license | Industrial zone and survivor supply locations |
| P1 | [Quaternius Zombie Apocalypse Kit](https://quaternius.com/packs/zombieapocalypsekit.html) | Apocalypse-themed props, vehicles, characters/environment pieces | Pack advertised as CC0; verify archive | Select environment props and vehicle silhouettes |
| P1 | [Poly Haven](https://polyhaven.com/) | Realistic models, HDRIs, environment lighting | CC0 | Landmark props, sky/lighting, high-quality hero assets |
| P1 | [ambientCG](https://ambientcg.com/) | Concrete, brick, plaster, asphalt, rusted metal, dirt PBR materials | CC0 | Re-texture modular geometry without unique meshes for every variant |
| P2 | [OpenStreetMap](https://www.openstreetmap.org/copyright) + [OpenMapTiles](https://openmaptiles.org/) | Real-world road/building footprints and selected height data | OSM data is ODbL and requires attribution/share-alike obligations for derivative databases; tile/style/service terms differ | Optional procedural block layout reference, not a source of ready-made 3D building meshes |
| P2 | [Sketchfab downloadable models](https://sketchfab.com/) | Unique signs, wrecks, furniture, rubble, landmarks | Mixed per-model licenses; use only explicitly approved licenses and retain creator attribution where required | Hand-picked set dressing, never bulk-scrape indiscriminately |
| P2 | [OpenGameArt](https://opengameart.org/) | Props, textures, audio, occasional 3D models | Mixed per asset | Supplement gaps only after individual license review |

## What to build from the assets

1. **Modular wall system:** straight, corner, T-junction, doorway, window, half-height, damaged, reinforced, fence, gate and barricade segments.
2. **Building kit:** exterior shells, roofs, floors, stairs, door frames, windows, and reusable interior room pieces.
3. **Street kit:** road lanes, junctions, sidewalks, curbs, streetlights, traffic signs, barriers, abandoned cars and wrecks.
4. **Apocalypse dressing:** rubble piles, broken glass decals, boarded windows, burned-out props, debris clusters, trash, vegetation overgrowth and blood/grime overlays.
5. **POI kit:** convenience store, clinic, police/fire station, warehouse, gas station, checkpoint, survivor camp, safehouse and fortified player base.
6. **Material library:** concrete, asphalt, brick, painted metal, rust, plaster, wood, dirt and wet surfaces using shared PBR materials.
7. **Environmental ambience:** sky HDRIs where appropriate, fog/atmosphere, wind-reactive foliage and optimized looping environmental audio.

## Import and performance rules

- Prefer GLB/glTF for the browser renderer. Avoid runtime dependencies on third-party CDNs; bundle vetted files locally.
- Never download a whole pack into the production client. Select only needed models and record archive URL, creator, license, license file/hash, modifications, conversion tool/version and attribution.
- Keep an ASSET_CREDITS.md alongside imported content. Do not assume “free download” means public domain.
- Normalize scale/origin/orientation, remove unused meshes/materials, merge static geometry where appropriate, compress textures, and create low-detail variants for distant scenery.
- Use instancing for repeated props and walls where practical; share geometry/materials; avoid one draw call per tiny prop.
- Add collision separately and deliberately. Visual meshes must not silently become authoritative gameplay collision.
- Preserve server authority for movement, loot, combat and collision-relevant game state. Environment art must not change gameplay rules without a separate reviewed change.
- Keep an asset-pack prototype behind a feature flag until load errors, memory cleanup, mobile frame time, and collision/navigation are checked.
- For OSM-derived layouts, preserve required attribution and review ODbL obligations before distributing derivative datasets. Do not treat map tiles as a free asset dump.

## First implementation slice

Start with a small locally bundled **wall + doorway + damaged wall + barricade + rubble** set from a verified CC0 modular pack. Create a single test scene/block that demonstrates snapping, consistent dimensions, shared materials, and optional collision proxies. Only then expand into full building shells and street dressing.

## Scope status

- [x] Identify source candidates and intended categories.
- [x] Define license and technical intake checks.
- [ ] Download and verify selected archives.
- [ ] Bundle optimized models and license/credit files.
- [ ] Add an opt-in environment blockout using real imported models.
- [ ] Measure mobile performance and verify collision/navigation.

## Home-base fortification kit

The first placeable fortification pass uses low-cost procedural Three.js geometry so gameplay can be exercised before committing large model packs. It now covers sandbags, barbed-wire sections, trenches with upgrade tiers, mounted turrets, and rotatable entrance/exit gates. Replace individual procedural pieces with locally bundled assets only after each file's license and runtime cost are verified.

Recommended intake:
- [Kenney Building Kit](https://kenney-assets.itch.io/building-kit) — official pack page states CC0 1.0 and includes walls, floors, doors and windows. Useful for the shelter shell and modular gate/door pieces, not a complete military fortification set.
- [Kenney support / license FAQ](https://kenney.nl/support) — confirms CC0 assets may be used commercially without required attribution.
- [MIT Three.js tower-defense reference](https://github.com/djpav/threejs-tower-defense) — study placement, selection, upgrade and touch interaction patterns; do not copy its game content wholesale.

Do not assume these sources contain sandbags, wire, trenches or functional turrets. Source those models separately, keep the current procedural fallback, and retain each selected pack's own license and attribution file.
