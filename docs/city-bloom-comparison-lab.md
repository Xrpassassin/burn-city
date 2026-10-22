# BURN City bloom comparison lab

This lab changes parameters on the existing city `UnrealBloomPass`; it does not add a pass, renderer, shader, dependency, or geometry. It is enabled only when the page URL contains `?graphicslab=1`.

## Compare

1. Load the city with `?graphicslab=1` (keep the same quality tier and device for comparisons).
2. In the browser console run:
   ```js
   window.__graphicsTest.setBloomPreset('ember')
   window.__graphicsTest.setBloomPreset('crisp')
   window.__graphicsTest.setBloomPreset('balanced')
   ```
3. Compare identical camera positions and weather/time conditions. Check token/tower edges, neon halos, text readability, bright pool convergence lines, frame time and thermal behavior on mobile.
4. Record the selected quality tier, device, FPS, and whether bloom is visually clearer or merely stronger. The balanced profile is the current default.

## Shadow assessment

The current city renderer has explicit quality tiers and an adaptive resolution/bloom fallback, but the inspected `app.js` has no `R.shadowMap.enabled` setup. Do not enable global shadow maps as part of this lab: it could add significant GPU and draw-call cost. A separate shadow proposal should identify a small set of high-value objects, verify materials and light setup, and compare GPU frame time on low-tier mobile hardware before implementation.

## Hark validation

Run `node client/js/bloom-comparison-presets.test.mjs`, `npm run test:bloom-comparison-presets`, and `npm test`. Then run the browser comparison above. Report automated tests and visual/performance observations separately; no FPS gain is assumed.
