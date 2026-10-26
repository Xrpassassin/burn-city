# BURN City frontend design direction

Inspired by Anthropic's frontend-design skill at commit dbd4588f9e1033efb41dad4bef2f7947c8993d44:
https://github.com/anthropics/skills/tree/dbd4588f9e1033efb41dad4bef2f7947c8993d44/skills/frontend-design

This is an original project-specific adaptation, not a verbatim redistribution of the upstream skill. Check upstream licensing before copying its files.

## Product identity
BURN City is an explorable, wallet-aware 3D world with several distinct games. Its interface should feel like physical equipment in each world, not a generic SaaS dashboard floating over the game.

## Two-pass design process
1. Define the player, current task, setting, and a short design plan (colors, typography, spatial layout, interaction vocabulary). Review for generic styling.
2. Implement only after checking the plan against gameplay context. Critique with screenshots at desktop and mobile sizes. Fix keyboard, touch, focus, contrast, and reduced-motion issues.

## Shared tokens (proposal, not a blanket restyle)
- Coal: #151B22 (dark panels)
- Slate: #293641 (secondary surfaces)
- Ash: #D7DFE2 (primary text)
- Ember: #E38A42 (action accent)
- Lake: #5BAFB5 (water / fishing information)
- Alert: #DB695B (destructive actions)

Use system-ui for body text until a properly licensed bundled typeface is selected. Use a restrained display face only for world/game headings, not for dense HUD readouts. Body copy should remain readable on a 390px mobile viewport.

## One component language, distinct worlds
- City: dark industrial, readable wayfinding and travel.
- Estates: stone, timber, copper, waterfront teal. Prioritize property access clarity and dock labels.
- Fishing: compact tackle-box UI; distinguish cast, bite, reel, catch, and errors with clear feedback.
- Homefront: utilitarian field equipment, robust status and workshop controls.
- Zombies: urgent combat readability, strong ammo/perk hierarchy.
- Eternal Grind: fantasy texture and ornament only where it does not obscure information.

## Shared interaction contracts
- Prefer sentence-case, action-specific labels: 'Cast line', 'Reel in', 'Inspect property', 'Return to city'.
- Keyboard focus is visible; pointer and touch actions reach the same underlying behavior.
- Minimum touch target 44x44 CSS px; preserve mobile safe-area insets.
- Respect prefers-reduced-motion; avoid continuous ornamental UI animation.
- Never make a private property or payment action look available before server-side authorization.
- Do not conflate free in-game lake coins with XRP, cash, or withdrawable balances.
- Preserve existing game logic and routes. Refactor styles separately from physics, combat, economy, and wallet flows.
- Keep HUD overlays sparse enough that players can see and control the world.

## Implementation order
1. Audit current city/Estates/fishing UI and capture baseline screenshots.
2. Add scoped CSS custom properties and an opt-in component pattern; do not globally override button, panel, or canvas styles.
3. Pilot fishing dock and casting UI with mobile and keyboard tests.
4. Extract reusable primitives only after the pilot demonstrates a genuine shared need.
5. Extend themes to other games in separate, reviewable PRs.

## Acceptance criteria
No loss of existing interactions; no unauthorized private action; responsive at 390x844 and desktop; visible focus; reduced-motion behavior; contrast checked; screenshot comparison reviewed; gameplay regression tests pass.
