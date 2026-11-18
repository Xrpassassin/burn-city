# BURN City experience contract

**Intent:** the player lives in one coherent world, not in multiple websites inside a game. The 3D world is the product; the interface is a navigational instrument.

## Design pillars

1. **World first.** Default view exposes the scene, player and immediate interaction. Keep tokenomics, tutorials and secondary tools behind intentional actions. No unsolicited full-screen panels during play.
2. **One identity, context-aware atmosphere.** Charcoal surfaces, ember warmth, disciplined typography and restrained motion connect City, Estates, Homefront, Zombies and space. Different games can adapt their danger/ambience accents without replacing navigation conventions.
3. **One interaction grammar.** A predictable opener, an obvious exit, one active top-level navigation overlay, Escape/back to dismiss, and a focus return target. Menu categories tell players *where they go* before asking them to learn a feature.
4. **Inputs are equal citizens.** Keyboard, mouse, touch and controller must reach the same actions. On phones the world remains visible above short bottom sheets; on desktop menus become compact side drawers. Respect safe areas and 44px touch targets.
5. **Status is not clutter.** Health, ammo, stakes, and live gameplay states appear only where relevant; ledger signals and wallet economics remain discoverable, truthful, and secondary to moment-to-moment play.
6. **Performance is part of immersion.** No UI dependency may stall rendering or loading. Honor reduced-motion settings, keyboard focus, offline service-worker caching and weak mobile GPUs.

## System ownership and layout zones

| Layer | Owns | Rule |
| --- | --- | --- |
| World | WebGL scene, movement, enemies, environment | Never blocked by decorative UI |
| HUD | Brand, live status, current context, gameplay vitals | Reserve top and edge safe-area zones; hide when a modal needs focus |
| Navigation | Movement & Games, secondary More actions, pause/exit | Exactly one top-level navigation overlay at a time |
| Interaction | prompts, inventory, property actions, context tools | Context-scoped and dismissible; never silently trigger XRPL writes |
| Transactions | Estates purchases, wallets and rewards | Separate confirmed actions from estimates; no guaranteed-return language |

The system's **single source of visual truth** is `client/burn-ui-tokens.css`. Legacy aliases remain where necessary for backward compatibility. City presentation is `client/ui-v8.css`; Estates presentation is `client/estate-theme.css`. Never introduce a new hard-coded palette for a mode without checking the shared tokens first.

## Interaction contract

- The active top-level menu closes when another top-level menu opens.
- Menu buttons support opening via Enter, Space or ArrowDown; menu entries support ArrowUp/Down, Home/End and Escape. Escape restores focus to the trigger when closing a menu.
- The Movement & Games dialog traps Tab and Shift+Tab, restores focus on dismissal and has a visible Close button. No hidden tab participates in focus order.
- Gameplay input must not leak through an active navigation overlay. Menu controls must not steal input while closed.
- Mobile landscape and narrow portrait are first-class: no off-screen menu, horizontal overflow or overlap with primary navigation.

## AEGIS signal policy

AEGIS news belongs in a **compact top rail**, below navigation/status and outside gameplay controls. The latest validated feed headline rotates without a moving marquee; urgent Response Ops and threat escalations temporarily take priority. No duplicate gameplay event banner or floating toast. Players can snooze the news rail for fifteen minutes without disabling AEGIS beacons, cameras or the city feed. Clicking a headline opens AEGIS Command; tapping Close snoozes. The rail yields to active menus, the AEGIS console, Estate interiors and high-priority gameplay banners. AEGIS remains optional and cannot change weather, wallets or rewards.

## Implementation sequence

**Stage 1 — shell (merged #650):** Ember Glass responsive navigation, Estates consistency, five-viewport browser QA.

**Stage 2 — shared contract (this PR):** common CSS tokens, one-active-menu behavior, keyboard-accessible overflow navigation, design documentation and regression tests.

**Stage 3 — mode integration:** map Homefront/Zombies/Estates/space interfaces to the common shell; keep third-person action controls responsive, overlay inventory only when requested, and maintain mode-specific state via a lightweight adapter. Never replace the underlying Zombies combat or Homefront movement logic to match a CSS prototype.

**Stage 4 — experience polish:** restrained location transitions, contextual audio cues, clear destination labels, focused first-run guidance, controller checks and performance profiling against real devices.

**Release gates:** run targeted unit tests, five-viewport browser smoke, no console/runtime exceptions caused by UI changes, functional keyboard and touch entry/exit, service-worker precache correctness, and a Fly.io post-deploy smoke test. Vercel is not a deployment blocker for the Fly.io server.

## Open source decision record

Use established open source where it solves a real problem; avoid installing a framework merely to style a button. Verify the exact source/license before vendoring code or committing assets.

- Three.js (MIT; already vendored): keep for 3D rendering and scene transitions rather than adding a second renderer.
- W3C WAI-ARIA Authoring Practices (published interaction patterns): use its dialog and menu keyboard behavior as accessibility guidance. The current UI uses native DOM semantics and small local handlers; no runtime package needed.
- Floating UI `@floating-ui/dom` (MIT): candidate if future inventory tooltips, menus or contextual prompts need collision-aware anchored positioning; not needed for the current fixed side drawer.
- Lucide (ISC): candidate for a coherent icon set in later work. Prefer a curated self-hosted subset, with preserved license notices, over a runtime CDN.
- Sketchfab and other 3D assets: check each exact asset license; preserve artist attribution and track provenance in `client/city-credits.html`. Avoid noncommercial-only/restricted derivatives.

Upstream references:
- https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/
- https://www.w3.org/WAI/ARIA/apg/patterns/menubutton/
- https://github.com/floating-ui/floating-ui
- https://github.com/lucide-icons/lucide
- https://github.com/mrdoob/three.js
