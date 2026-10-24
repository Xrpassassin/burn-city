# Estates building-placement contract

`server/estates-building-placement.js` provides deterministic server-side validation for future workshop/build mode. It snaps placements to a 0.5 m grid, allows quarter-turn rotations, checks the build footprint against the lot boundary, rejects overlaps with saved placements on the same property, and returns a whitelisted building descriptor with material-cost metadata.

## Current building prototypes

- `barricade`: compact defensive barrier
- `garden`: small garden plot
- `generator`: utility footprint
- `storage_shed`: storage building
- `workshop`: larger crafting/workshop footprint

These are gameplay data prototypes, not rendered assets, inventory transactions, or completed crafting systems. Costs are descriptive metadata; this helper does not debit inventory or reserve resources.

## Trust boundary

The caller must load the authenticated principal, current permission grant, lot geometry, and saved placements from trusted server-side systems. Never accept those values as authoritative JSON from the browser. The authorization grant marker is an internal contract, not a cryptographic signature; the upstream authorization service must validate it. The function does not persist placements, prevent concurrent writes, or replace database constraints. A later save route must revalidate authorization and geometry transactionally before committing.

## Validation

Run `npm run test:estates-access-policy` and `npm run test:estates-building-placement`.
