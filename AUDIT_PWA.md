# Burn City: PWA + audit (2026-10-13)

## Installable app (new)
- `manifest.webmanifest`: name/short_name "Burn City", start_url/scope `./`, `display: fullscreen` with `display_override` standalone fallback, dark `#050a18` theme/background, icons 192/512 + maskable 512 (`icons/`).
- iOS: `apple-touch-icon` (180px), `apple-mobile-web-app-*` meta tags, safe-area insets in the layout.
- `sw.js` (versioned `bc-vN-*` caches; old versions deleted on activate, `skipWaiting` + `clients.claim` so nobody stays on old code):
  - vendor three.js + icons: cache-first (version-pinned, never change).
  - HTML, app JS, CSS, `data.js`, `data/*.json`: **network-first** (`cache: no-cache`), cache only used offline. The nightly `data.js` refresh is always picked up when online.
  - XRPL live feed (wss) and GoatCounter: never intercepted.
  - **Bump `VERSION` in sw.js when app code changes** (network-first means it's not strictly needed, but it clears old caches).
- `js/pwa.js`: subtle **⬇ Install** button (only appears when Chrome/Edge/Android fires `beforeinstallprompt`); one-time iOS hint "Share → Add to Home Screen".
- GoatCounter tag kept.

## Audit findings and fixes
| Area | Finding | Fix |
|---|---|---|
| CDN dependency | three.js + 8 addons loaded from unpkg; if unpkg slow/blocked the city never loads | Vendored three r160 (16 files, ~830 KB, MIT license included) under `vendor/three/`; import map points local. No CDN needed. |
| Mobile layout | HUD title box overlapped the button row on iPhone 13 / Pixel 7; event banner could collide | HUD capped at 34vw, buttons get the rest, banner moved below the top bar, safe-area insets. Verified no overlap by bounding-box check. |
| Live feed | Reconnect used exponential backoff (up to 30s) even after a phone wakes / goes back online | Reconnects immediately on `online` / tab becoming visible. Heartbeat + endpoint rotation already fine. |
| Accessibility | Icon-only buttons, selects and sliders had no labels (Lighthouse a11y) | Added aria-labels. |
| Favicon | `data:,` placeholder | Real fiery favicon. |
| Console errors | 0 on desktop, iPhone 13, Pixel 7 emulation | none needed |
| 404s | none found | none needed |
| Share links / graphics setting | Link button and `?q=` / localStorage quality switch work | none needed |
| Secrets | Scanned repo: no keys/tokens | none needed |

## Still open / by design
- Lighthouse performance is low in headless (software WebGL); real devices render on GPU. The "Auto" graphics tier handles phones.
- `user-scalable=no` is flagged by Lighthouse a11y but kept on purpose: pinch-zoom would fight the 3D touch controls.
- No `<main>` landmark (canvas app); minor.
- Live feed shows "Connecting" in sandboxed test browsers that block XRPL websockets; works in normal browsers.
