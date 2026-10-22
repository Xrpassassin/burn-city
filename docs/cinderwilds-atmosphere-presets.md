# CinderWilds atmosphere preset lab

This isolated visual experiment adjusts only the forest's existing fog density, fog tint blend and existing light-shaft opacity. It does not add lights, shadow maps, bloom, geometry, shaders, render passes or dependencies. The default multipliers reproduce current settings.

## Browser comparison

1. Load BURN City with `?wildstest` or `?debug=1`.
2. Enter CinderWilds and wait for loading to finish.
3. Use the console:
   ```js
   window.__wilds.test.setAtmospherePreset('moonlit')
   window.__wilds.test.setAtmospherePreset('clear')
   window.__wilds.test.setAtmospherePreset('balanced')
   ```
4. Compare the same location at both day and night. Check creature readability, trail visibility, fog banding, visual clarity, frame time and GPU use.
5. Leave and re-enter the forest; confirm the balanced default is restored and no debug API exists in ordinary sessions.

These presets are for comparison only. Do not choose a production default based on unit tests; review screenshots and performance on desktop and mobile first.

## Hark validation

Run `node client/js/wilds-atmosphere-presets.test.mjs`, `npm run test:wilds-atmosphere-presets`, and `npm test`. Then perform the browser comparison above. Report visual/browser results separately from automated test results.
