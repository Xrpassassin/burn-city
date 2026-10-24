# Cosmodrome combat polish

This follow-up is stacked on `feat/cosmodrome-campaign-progression` and stays outside `main` until the campaign PR is reviewed.

## Changes in this pass

- Add the Ashen Warden, a slow, high-health elite that spawns as the first threat on Cosmodrome waves 8, 12, 16, and subsequent multiples of four.
- Give the Warden a short, readable charge telegraph using the existing charge event, a reduced movement speed, an oversized crimson-tinted animated model, a larger amber minimap marker, and a 1,200-point kill reward.
- Make ranged-shooter and melee damage independent of the configured invulnerability-frame duration. `ZOMBIE_IFRAME` controls the protection window; it must not multiply the damage amount.
- Make the Cosmodrome enemy simulation deterministic by pinning `Math.random` during each simulation. The previous `room.rng` override did not control spawn selection because the simulation calls `Math.random` directly.
- Extend the focused simulation with Warden spawn and elite-stat assertions.

## Validation still required

The edited CommonJS files have passed syntax parsing in the connector runtime. The actual Node simulation, full `npm test` / `npm run test:all`, and desktop/mobile playtests have not yet been executed here. In-game QA should verify the boss appears only in Cosmodrome Free Play, charge telegraph readability, Warden collision/navigation, ranged damage and down/revive handling, and performance with many zombies.

## Weapon skins

The existing campaign PR already provides stronger Tier-I/Tier-II named weapon evolutions and a cyan Tier-II forge effect. This pass does not claim new first-person weapon meshes or per-gun material skins; those require wiring into the actual weapon presentation path and should be completed as a separate visual slice after the combat tests are passing.
