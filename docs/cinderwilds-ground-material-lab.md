# CinderWilds ground material comparison lab

This test-only experiment compares the current grayscale micro-detail texture against a procedural, muted forest palette with moss, leaf litter, soil, and bark-like flecks. It changes only the existing floor texture; it adds no geometry, draw calls, external assets, or runtime dependencies.

## Browser test

1. Open the game with `?wildstest` or `?debug=1`.
2. Enter CinderWilds and wait for the forest to finish loading.
3. In the browser console run:
   ```js
   window.__wilds.test.setGroundMaterial('natural')
   window.__wilds.test.setGroundMaterial('current')
   ```
4. Compare the same locations at different times of day. Check color accuracy, texture tiling, visual noise, readability, GPU memory and frame time.
5. Exit and re-enter the forest; confirm the alternate texture is disposed with the forest and can be recreated cleanly.

The alternate texture exists only during test/debug sessions. Normal players retain the current texture until visual review confirms the natural variant is an improvement. This is a material study, not a terrain geometry or lighting rewrite.

## Hark validation

Run `node client/js/wilds-ground-materials.test.mjs`, `npm run test:wilds-ground-materials`, and `npm test`. Also perform the browser comparison above; unit tests cannot establish visual quality.
