# Forest Encounter Data Contract — Design Proposal

## Why this exists
The Regional Encounter Planner (PR #76) is a visual design aid. This proposal turns its concepts into a reviewable, data-driven catalog without connecting it to live gameplay prematurely.

## Files
- `FOREST_ENCOUNTER_CATALOG.json`: sample archetypes, region bands, encounter templates, event eligibility, and safety caps.
- `FOREST_ENCOUNTER_CATALOG.schema.json`: JSON Schema Draft 2020-12 for the catalog's basic structure.

## Important scope boundary
This is **not wired into the game** and does not establish the production runtime's units, spawn scheduler, entity ownership, or region IDs. The sample values are design placeholders. The meter-based spacing field must be mapped to the actual world coordinate system before use. Do not treat threat tiers as character levels or combat multipliers.

## Intended architecture
1. Keep the catalog as declarative content, separate from runtime spawn decisions.
2. Adapt it to the existing zone and enemy-definition system only after Hark identifies the current authoritative server-side spawn path.
3. Resolve candidate templates server-side against region allow-lists, player eligibility, entity budgets, and protected-zone boundaries.
4. Validate catalog references at load/build time: unique IDs, known archetypes, known region/template references, tier limits, elite permissions, and total member counts.
5. Keep combat stats, drop tables, persistence, and player progression outside this catalog until each is explicitly designed and reviewed.

## Non-negotiable safety invariants
- No hostile spawns inside protected regions.
- No hostile aggro crossing a protected boundary.
- Elite templates only in explicitly authorized regions and events.
- Enforce entity and group caps server-side; client display is not authority.
- Events may narrow or select among region-allowed templates; they may never bypass region permissions or safety caps.
- Every archetype needs readable tells and a documented counterplay loop.
- When validation fails, fail closed for that template and log a useful diagnostic; do not silently accept malformed content.

## Review checklist for Hark
- [ ] Identify current zone identifiers, coordinate units, spawn authority, and existing enemy schema.
- [ ] Confirm catalog IDs do not collide with current runtime identifiers.
- [ ] Add a validator for duplicate IDs and all cross-references (JSON Schema alone does not check referential integrity).
- [ ] Verify all region template allow-lists resolve.
- [ ] Verify elite templates are rejected in regions where `eliteAllowed` is false.
- [ ] Verify protected regions cannot receive hostiles, including event-driven selections.
- [ ] Test entity/group caps and invalid/missing fields.
- [ ] Confirm no client-side code can authorize spawns.
- [ ] Add automated tests before any runtime wiring.
- [ ] Keep production integration in a separate PR from content tuning.

## Suggested acceptance tests
1. Starter camp with any event selected: zero allowed hostile templates.
2. Outer forest requesting `warden_hunt`: rejected.
3. Deep forest with elite permission disabled: `warden_hunt` rejected.
4. Corruption surge in the outer forest: only outer-region-allowed templates remain eligible.
5. A template referencing an unknown archetype: catalog validation fails.
6. A region referencing an unknown template: catalog validation fails.
7. Template total member count above the server cap: rejected or safely clamped by an explicitly documented policy.
8. Missing or invalid catalog: no uncontrolled fallback spawning; report a diagnostic.

## Handoff
This proposal should be reviewed against the actual repository implementation before a runtime adapter is written. The sample values intentionally do not modify current enemy stats, server protocol, saves, inventory, loot, or progression.
