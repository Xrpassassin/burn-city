# Homefront interior camera: swept-lens approximation

The Homefront third-person camera previously tested exactly one line between player eye and desired camera position. Near authored door frames, wall edges and interior corners, the *camera body* could intersect a wall even while the center ray missed it, producing a visibly clipping third-person view.

The updated camera now samples a small, fixed-size lens volume with parallel wall rays:

- Desktop: 5 probes (center, 2 lateral, 2 vertical).
- Coarse pointer/mobile: 3 probes (center and lateral).
- The earliest visible wall hit becomes the existing `clipInteriorCamera()` clearance distance; the existing padding algorithm keeps the lens on the player's side.
- The raycasts run **only inside the active interior** and retain the existing 45 ms desktop / 90 ms coarse-pointer throttle. The authored structural-occluder list is filtered only once per batch. Opening doors still removes their corresponding visible occluder.
- First-person and outdoor cameras are unchanged. No changes to server collision, authoritative hitboxes, movement, inventory, progression, PvP or privacy.

This uses engine-neutral reasoning from the MIT-licensed `open-game-skills` Three.js camera guidance ([upstream](https://github.com/jammyfu/open-game-skills/blob/main/skills/engines/threejs/SKILL.md)); no external runtime dependencies or copied implementation were included. See [Skill Issue](https://skill-issue.in/) for the skill-catalog source discovery.

## Tests and acceptance boundaries

`node client/arena/homefront-camera-occlusion.test.mjs` checks finite camera origins, probe count and symmetries, a vertical camera arm, device-reduced probe budget, existing near/far camera clipping and no state mutation.

`node test/homefront-graveyard-3d.test.mjs` checks that Three.js uses the probe helper, caches the visible structural occluders, respects mobile ray limits, never applies wall avoidance outdoors/first-person, and keeps the legacy camera rig.

`npm run test:homefront` and the existing Homefront core workflow include both.

**Manual QA outstanding:** On a desktop and a physical mobile browser, walk backward through a narrow door, orbit near inner corners and approach a wall in third person. Confirm the player stays visible, camera avoids wall penetration, no wild zoom oscillation, and frame time remains acceptable. Script-level checks do not prove real optical correctness or frame-rate performance.
