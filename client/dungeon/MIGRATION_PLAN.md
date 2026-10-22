# Migration plan module

**Status:** deterministic read-only planner; not a save converter.

Run tests with Node 22+:

`node client/dungeon/migration-plan.test.mjs`

The planner:
- Validates a narrow subset of the current save's shape.
- Produces a deterministic review plan for a player-selected proposed target class.
- Makes specialization selection explicit.
- Lists which fields require mapping or compatibility decisions.
- Never returns a game-ready save, writes storage, changes the input object, or marks the plan ready to commit.

This is deliberately incomplete until the target progression rules, derived-stat formulas, item/ability mappings, unsupported-item compensation, and migration versioning are approved. A source version integer is not sufficient proof that all fields are understood; production validation must explicitly allow known versions and reject unknown ones.
