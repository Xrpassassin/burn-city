# City street buildings (Scarecrow_original sci-fi set, CC BY 4.0)

Box-only asset tools (not run in CI) behind `client/assets/buildings/` and `client/js/citybuildings2.mjs`. Brief: PR #631,
`docs/burn-city-street-building-models.md`. Credits: `client/city-credits.html`.

1. `download.py` pulls the seven source GLBs and their licence metadata from the Sketchfab API into a staging folder
   (needs `SKETCHFAB_API_TOKEN` in the environment; the token is never printed or stored). Anything not CC BY / CC0 is skipped.
2. `prep_building.py` (Blender 4.2): `blender -b -P prep_building.py -- src.glb out.glb preview.png 512` joins the parts into one mesh,
   centres the footprint, grounds it at y=0, resizes the textures to 512 px and renders a preview.
3. `gltfpack -noq -si <r> [-sa]` simplifies: LOD0 keeps attribute seams (`-si 0.15` for Building 4, `-si 0.3 -sa` for Building 5, the
   rest unchanged); LOD1 targets about 700 triangles with `-sa`.
4. `combine_lods.py` (Blender) puts LOD0 and LOD1 in one `.gltf` that shares a single material and one set of external JPEG textures.
   External textures matter: the City's CSP has no `blob:` in `connect-src`, so GLB-embedded images fail to load.

| Model | Source triangles | LOD0 | LOD1 | Source GLB | Shipped (gltf+bin+textures) |
| --- | ---: | ---: | ---: | ---: | ---: |
| Sci-fi building 7 (BURN) | 4,170 | 4,170 | 547 | 3.19 MB | 362 KB |
| Sci-fi Building 10 (IMM) | 6,772 | 6,772 | 681 | 2.98 MB | 399 KB |
| Sci-fi Building 11 (XRPyro) | 4,328 | 4,328 | 338 | 2.44 MB | 336 KB |
| Sci-fi Building 4 (not assigned yet) | 39,054 | 5,858 | 482 | 3.80 MB | 322 KB |
| Sci-fi Building (not assigned yet) | 1,406 | 1,406 | 686 | 2.68 MB | 215 KB |
| Sci-fi Building 6 (not assigned yet) | 2,032 | 2,032 | 620 | 2.21 MB | 240 KB |
| Sci-fi Building 5 (not assigned yet) | 17,648 | 4,243 | 454 | 3.60 MB | 218 KB |

Textures: four 1024 px maps per model become 512 px JPEGs. Normal and metalness maps are dropped at runtime (see the module header).
