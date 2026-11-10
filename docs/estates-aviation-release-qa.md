# Estates private aviation and rooms — release QA

Branch: `feature/estates-tycoon-upgrades-20261109`; review PR #593.
Current XRP Tycoon purchases remain disabled by default and **must not be enabled just to test**.
The checked unit/HTTP coverage is separate from actual desktop and iOS gameplay QA.

## Automated gates (required)

- [x] PR branch reconciled with `main` without overwriting instant-deposit settlement code
- [x] Authenticated Tycoon upgrade purchase and 60 XRP/20 recorded-share tests
- [x] Private room owner/guest access, revoked invitation and tour-denial tests
- [x] Helicopter landing, local flight bounds, real Family/Mansion roof clearance and no altitude jumps
- [x] City physics bypass while flying, pilot visibility, touch/keyboard focus recovery
- [x] Private Hangar flight session, replay, resale, server-restricted cosmetics, session expiry
- [x] Wallet-change private Hangar UI data suppression, including delayed network response
- [ ] Every required PR workflow green on the *final* merge candidate head SHA
- [ ] Combined regression against the latest moving `main` if further changes are merged

## Desktop and iOS WebGL checks (not yet verified)

- [ ] Open BURN City in actual Chrome/Safari, enter Estates via bridge, return to city and reenter; verify no canvas overlay or black-screen regression
- [ ] On an eligible Family Home and Luxury Mansion with a **verified, already settled** helicopter upgrade, ensure roof pad and rotor do not clip nearby homes, rooftop geometry, roads or public paths
- [ ] Verify a nonowner can see publicly approved helicopter colors but cannot pilot or fetch private logbook/callsign
- [ ] Verify owner boards only from the exterior property approach, not remotely, even after waiting on a slow authorization response
- [ ] Confirm walking/gravity/jetpack/skate physics stop while flying; the avatar stays hidden; helicopter and camera follow the actual craft
- [ ] Move camera, climb, descend, strafe, complete all three viewpoints, return and land safely; ensure no sudden roof-edge altitude snap or out-of-bounds escape
- [ ] Test ascend and descend using the touch ▲/▼ controls on iOS; press/hold/release, background Safari mid-hold, return, and confirm no permanently stuck throttle
- [ ] Suspend the wallet session, switch wallets, revoke/transfer ownership while flying; verify prompt forced return and no inherited pilot authority
- [ ] Kill the network during a flight and return; ensure game recovers and **does not claim an unrecorded flight was saved**
- [ ] Reconnect, open the private Hangar, customize color/trim/callsign, reload and confirm persistence and unchanged payouts; verify other visitors see only public colors
- [ ] Switch wallets with private Hangar open and with a GET request in flight; private history and callsign must disappear immediately or on the next focus/session poll
- [ ] Visit each purchased private bunker/lounge/arcade, toggle power, exit, change invite ACL, reload, and verify entry and privacy checks
- [ ] Test long session and 20+ players near high-tier properties; inspect mobile FPS, shader compilation and geometry/material disposal

## Rollout and financial safeguards

- [ ] Keep `ESTATE_TYCOON_UPGRADES_ENABLED` disabled until independent payment/ledger/security/treasury review
- [ ] Do not treat recorded upgrade-share units as active reward weights
- [ ] Do not treat client-reported sightseeing checkpoints as server-verified events or award tokens/XRP
- [ ] Do not mark the PR ready or merge to production solely because code tests pass; record actual desktop/mobile WebGL findings
- [ ] On release, verify `/api/deploy-version` SHA and service worker refresh; test against the deployed commit, not a local draft

No live browser gameplay tests or production payment activation are claimed by this document.
