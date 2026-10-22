# PYRETHEUM / BURN Tower visual asset policy

## Current implementation

The tower interior and rooftop are assembled from procedural geometry, canvas-generated textures, and materials in `client/js/tower-interior.js`. The rooftop skyline, windows, planters, and foliage are generated at runtime; they do not require downloaded art assets.

The scene uses the project's existing Three.js runtime. The rooftop skyline uses `THREE.InstancedMesh` for repeated buildings, windows, and planters to reduce draw calls. This is a rendering optimization, not a guarantee of performance on every device; browser and mobile profiling is still required.

## Open-source reuse rules

When adding reusable code or art to BURN City:

1. Prefer permissively licensed projects and assets (MIT, BSD-2-Clause, BSD-3-Clause, or Apache-2.0) compatible with the project's distribution.
2. Read the exact repository or asset license before copying or adapting it. A public GitHub repository is not automatically licensed for reuse.
3. Preserve required copyright notices, license text, and attribution. Keep third-party assets and their licenses identifiable.
4. Do not import an asset pack, model, texture, sound, or code snippet without verifying its license and source.
5. Prefer small, isolated changes that reuse the current Three.js scene, collision model, materials, and input patterns. Avoid adding another renderer or a large dependency just for visual polish.
6. Keep optional high-cost effects scalable or disabled on touch/mobile devices, and test actual frame time before declaring an optimization successful.

## Next visual polish targets

- Add bevels and layered trim to selected high-visibility edges instead of beveling every object.
- Improve glass with restrained tint, metal mullions, and reflections that remain readable on mobile.
- Add contact shadows and light pools selectively; avoid adding many real-time point lights.
- Refine upholstery, tabletop details, planters, and floor seams with shared materials and instanced geometry.
- Profile the rooftop and tower together, because the tower is part of a larger game scene.

## Validation status

The source changes need JavaScript syntax validation and in-game browser/mobile testing. Do not treat the procedural skyline or any planned polish as runtime-verified until those checks are run.
