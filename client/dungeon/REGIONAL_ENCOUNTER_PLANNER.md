# Eternal Grind — Regional Encounter Planner

## Purpose
Interactive design aid for discussing regional threat progression and encounter composition with Hark. It is not runtime spawn logic.

## Open
Serve the repo normally, then visit `/client/dungeon/regional-encounter-planner.html`.

## Design knobs
- **Distance from safe gate:** represents the intended progression from protected starter space into the forest interior.
- **Threat tier:** a design label, not a direct multiplier to production stats.
- **Encounter density:** influences the illustrative number of groups; production needs hard caps and spacing checks.
- **Composition:** balanced patrols, ambush territory, ranged support, or elite grounds.
- **Regional event:** migration, corruption surge, or elite hunt.

## Design principles
1. Preserve protected starter areas and make their boundaries obvious.
2. Increase danger through enemy combinations, positioning, telegraph complexity, and encounter context—not only larger health pools.
3. Keep elite enemies rare, visually distinct, and signposted. Avoid silent level/stat inflation.
4. Give each enemy role counterplay: melee can be kited or dodged; skirmishers telegraph flanks; ranged enemies expose targeting windows; ambushers provide environmental/audio clues.
5. Cap simultaneous aggro and keep minimum spacing between groups, especially on mobile and low-end devices.
6. Events change roster/composition and communicate their state to players; do not bypass server-authoritative combat.
7. Spawn selection must be server authoritative in multiplayer, validated against the existing zone/AI system, and resilient to disconnects/restarts.

## Production integration gate for Hark
Before implementation, inspect the existing zone/encounter system and document:
- spawn ownership (server vs client),
- current enemy definitions and role fields,
- player-level / zone-level rules,
- safe-zone boundaries and aggro rules,
- persistence and restart behavior,
- entity limits and mobile performance budgets.

Then propose a small follow-up PR that adds data-driven encounter definitions to the existing system. Do not add a parallel spawn engine, change server protocol, or rebalance combat in the same PR.

## Validation checklist
- Load through the regular app server; inspect browser console.
- Test all parameter combinations, especially safe gate + elite hunt and high-density + tier 5.
- Verify map labels and generated encounter cards remain usable on mobile.
- Treat the plan's group count and elite chance as illustrative only, not real spawn odds.
- No production gameplay, saves, inventory, combat, or server files are changed.
