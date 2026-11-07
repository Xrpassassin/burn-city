# Pine Crossing woodland and building polish

This pass adds presentation detail to the shared Pine Crossing map. Server
terrain, roads, solid collision, loot, door thresholds and rollout flags remain
unchanged.

- Original repeating bark colour and normal maps replace flat trunk colours.
  The two shared 128x256 RGBA maps use 256 KiB before mipmaps and are generated
  once locally; no download or new third-party asset is required. The deadfall
  reuses the same material.
- Five thin dry branches per tree break up the bare lower canopy. Branches are
  instanced per visible world chunk and stay above ordinary player/rover height.
- Deterministic fern clusters fill the woodland floor. Each plant has 64 triangles,
  shares one material, and sways through a single shader uniform. No per-plant
  JavaScript animation or alpha-cutout foliage is introduced. Bounds include
  a small allowance for wind.
- Fern placement preserves route edges and vehicle corridor reservations, excludes
  the authored store/clinic footprints and thresholds, and keeps plants out of the
  creek water. These low plants are decorative and do not create new blockers.
- Building walls darken near the ground, with a green/brown weathering tint. Rusted
  gutters/downpipes and cracked window lines add wear. Wall vertex colours retain
  the existing scanned concrete maps and do not move the wall geometry. Metalwork
  and glazing are batched per building.

Software rasterizers (SwiftShader/llvmpipe/softpipe) use a 0.75 framebuffer pixel
ratio to limit CPU rendering cost. Normal desktop and phone GPUs retain their
existing resolution caps. Renderer detection is local, guarded, and never sent
to the server.

Unit checks cover deterministic textures, texture/triangle budgets, clear travel
lanes and unchanged wall positions. Browser acceptance checks scene attachment and
shader compilation errors while walking the woods, entering and looting both
buildings, and returning along the creek. The dedicated woodland CI job exercises
both desktop and simulated touch. Physical phone frame-rate measurements are
still unverified.
