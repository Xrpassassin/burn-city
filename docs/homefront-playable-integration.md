# Homefront playable integration — November 6, 2026

Review branch only. No production deployment or feature-flag activation.

## Pinned inputs and integration plan

- Main `602936f4f68e7a265d5830274be2e7a0c5dd5314`, including merged #562 fullscreen opening/menus and #550 Wastes routing.
- #561 `92c7f409cb3a4a68ae51dfc85feffbf68c8b19d1`: individual infected presentation/audio, field combat and ammunition, physical loot, doorway entry/exit, server collision, refuge return, shared Zombies stick math, continuous preview controls/camera.
- #552 `b6ef5efe4f6c87be1196d1ef39566bc60d66282b`: disposable guest sessions, guest-aware transport, solo travel, wallet-save boundary, isolated preview fixtures and guest/browser tests.
- Admission/stale-401 fixes from the independent audit patch, with expanded regressions.

Gameplay merges first. The #552 conflicts are resolved by retaining the current main+#561 HUD/HTML/renderer and porting **only** guest behavior over it. #551 is not merged as a replacement for #562. Its isolated preview assets arrive through #552, not its old HUD implementation.

Preserved: fullscreen first paint; existing Build/Manage/Inventory/Travel panels and DOM ownership; gate transitions; hidden renderer suspension; world-response revision guard; main city exit wording; shared wallet persistence and server movement authority.

Additional integration corrections:

- Route continuous-input packets through the same guest transport as every other Homefront action. Guests never send a wallet bearer or wallet cookies, including movement.
- Preserve main's city exit, and make the link application-relative (`../`) so GitHub Pages `/burn-city/arena/` returns to `/burn-city/`, not the account's unrelated root page.
- Update opening/browser fixtures for automatic guest play instead of waiting forever for the retired login-required opening.
- Exclude #552's historical `fly-preview-access-preflight.yml`: it would reintroduce a PR workflow with repository Fly credential access. None of the added Homefront CI workflows use Fly secrets or deploy.

## Acceptance and safety

`npm run test:homefront` includes admission exhaustion, unclaimed-session expiry, concurrent starts, stale 401 ordering (including delayed JSON parsing), guest/wallet save isolation, guest movement transport, hosted-path city exits, and default-off movement API tests.

`HOMEFRONT_EXPEDITION_GUEST=1` runs the actual HTML, renderer, guest handler and authoritative engine with no wallet login. Its bounded localhost fixture selects a real disposable account with the same North Gate spawn used by the wallet fixture; it does not override movement, combat, loot or interior handlers. The script supports desktop/touch and physical building entry/loot/exit, then returns supplies to refuge and clicks the field-menu city exit. All fixture network requests are confined to localhost.

Production `HOMEFRONT_CONTINUOUS_MOVEMENT` remains default-off. Preview direct movement requires both an explicit client `?movement=continuous` and the server flag; clients cannot enable server input by query alone. Jump is the existing local visual hop, not a new server-authorized vaulting/traversal system.

## Remaining release gates

- Actual phone hardware performance/touch feel, live Xaman restoration and WAN multiplayer are not verified locally.
- Guest sessions remain process-local. Do not scale guest traffic across machines without affinity/shared ephemeral state; restarts intentionally discard guests.
- The global 128-session and three-session-per-IP limits need real load/NAT UX review.
- This branch is neither merged nor hosted. The old preview app is not redeployed, and production remains untouched.
