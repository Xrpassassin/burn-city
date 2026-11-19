# Estates Tycoon upgrade visuals: before / after

Rendered locally with headless Chromium (SwiftShader WebGL) using the real
`estates-house-design`, `estates-tycoon-decor` and `estates-helicopter-world`
modules, all 17 exterior upgrades plus the helicopter installed on each tier.
Night shots use the same scene with ambient/sun lowered.

All geometry is procedural Three.js primitives written for this repo; no
third-party models, textures or animations are used.

| View | Before | After |
|---|---|---|
| Starter, front | ![](before-starter-front.jpg) | ![](after-starter-front.jpg) |
| Family, rear | ![](before-family-back.jpg) | ![](after-family-back.jpg) |
| Mansion, front | ![](before-mansion-front.jpg) | ![](after-mansion-front.jpg) |
| Trailer, front | ![](before-trailer-front.jpg) | ![](after-trailer-front.jpg) |
| Starter, night | ![](before-starter-night.jpg) | ![](after-starter-night.jpg) |
| Family, night | ![](before-family-night.jpg) | ![](after-family-night.jpg) |

Install animation (mid-frame, ~0.4 s after a verified purchase lands):
![](after-install-animation.jpg)

## Round 2: CC BY Sketchfab models (progressive enhancement)

Primitives render first; models swap in once loaded (code-built fallback if any file fails).
Credits: `client/assets/estates-upgrades/CREDITS.md` and `client/city-credits.html`.

| Item | Primitives | Model |
|---|---|---|
| Helicopter | ![](primitive-close-heli.jpg) | ![](models-close-heli.jpg) |
| Fire pit | ![](primitive-close-firepit.jpg) | ![](models-close-firepit.jpg) |
| Security camera | ![](primitive-close-camera.jpg) | ![](models-close-camera.jpg) |
| Gnome + pond rocks | ![](primitive-close-gnome-pond.jpg) | ![](models-close-gnome-pond.jpg) |
| Starter, all upgrades | ![](after-starter-front.jpg) | ![](models-starter-front.jpg) |
