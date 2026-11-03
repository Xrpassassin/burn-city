# Zombies: wave encounter director — Phase 1

**Scope:** Unranked, non-daily, round-based Zombies (Refinery and Ashen Cosmodrome), **not Homefront**.

The authoritative `server/game.js` wave loop retains the original count, flow-field navigation, authored doors/windows, cap of 40 live zombies, weapon/hit detection, score, special zombie type IDs, Warden schedule, reconnect behavior and map/heli progression. Ranked and daily games continue their **original** type selection and pacing. A small stateless director adds varied standard-infected composition and modest spawn pacing to free play only.

## What changes for players

Starting at wave 4, individual free-play waves use one of four deterministic pressure styles: runner surge, crawler ambush, brute push or mixed pressure. Styles affect **ordinary types 0–2 only** at bounded spawn indexes. Existing special types 3–8 are always passed through unchanged; novel crawler composition is delayed until wave 6 and brute composition until wave 5.

The server announces each higher-pressure wave once, approximately 2.5 seconds before its first configured spawn. The existing Zombies HUD displays a short, locally mapped warning. On Cosmodrome Warden waves 8, 12, 16, etc., it displays a distinct Warden warning. This does not create client-authoritative threats or alter actual damage; it only makes a guaranteed existing encounter easier to anticipate.

Spawn-gap multipliers are intentionally modest (0.88–1.10). The original player-count scaling, max-alive cap, total-spawn formula and **minimum 0.55s base gap** remain, as do existing difficulty settings. No new models, effects, sound assets or financial actions are introduced.

## Architecture and verification

- `server/zombie-wave-director.js` — pure plan/selection functions, deterministic FNV-style per-room-and-wave profile, no RNG, no mutable global state
- `server/game.js` — only freeplay path uses director; publishes one `zpressure` warning on wave start
- `client/arena/index.html` — displays a fixed, whitelisted warning through existing toast UI
- `test/zombie-wave-director-sim.js` — checks 1/2/4/8 players, map/wave legality, special-type passthrough, deterministic composition, actual `Room` integration, once-per-wave warning and isolation of ranked/daily games
- `.github/workflows/zombies-encounter-director.yml` — focused simulation plus existing zombie/special/nav/forge/rotary regressions

**Outstanding manual playtesting:** Warnings should not overlap critical touch controls; composition should be felt on waves 5–20 without accidental difficulty spikes. Verify first-person controls, latency, 8-player lobby, cross-map flight, and performance on mobile. Automated simulations do **not** establish subjective feel, frame rate or audio performance.

## Planned follow-up

Continue with a separate combat/atmosphere pass, then prioritize Homefront's third-person continuous exploration and authentic base defense. Homefront must not inherit round-based Zombies waves, scores or spawn pacing.
