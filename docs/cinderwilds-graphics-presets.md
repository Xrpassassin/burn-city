# CinderWilds graphics preset spike

This isolated test-only experiment exposes three tuning profiles for the existing forest atmosphere:

- `balanced`: neutral multipliers; preserves current visual behavior.
- `cinematic`: slightly denser forest fog, stronger existing wind sway, and more visible existing light shafts.
- `mobile`: lighter fog, reduced sway, and reduced light-shaft opacity to test a less visually busy presentation.

The helper allocates no geometry, textures, post-processing passes, lights, or materials. It uses existing effects only, so it does not intentionally increase draw calls or shader variants.

## Access and safety

The profiles are wired only when the CinderWilds test flag is active (`?wildstest` or `?debug=1`). In the browser console, after the forest loads:

```js
window.__wilds.test.setGraphicsPreset('cinematic')
window.__wilds.test.setGraphicsPreset('mobile')
window.__wilds.test.setGraphicsPreset('balanced')
```

The default is `balanced`. The feature changes no normal gameplay behavior unless the test flag is present. Profiles are tuning starting points, not measured performance guarantees; compare screenshots, frame-time/FPS, readability, and phone heat before promoting any profile to player settings.
