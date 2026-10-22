# Eternal Grind Progression Core (Isolated)

This branch introduces a dependency-free, pure XP rules module and Node tests, then routes the live dungeon XP award function through it.

## What it does
- Captures the existing threshold formula: `round(60 × level^1.45 × (1 + 0.15 × (classCount - 1)))`.
- Calculates how an XP award crosses one or more level thresholds.
- Returns new state instead of mutating the character object.
- Supports an optional max level for future designs, but defaults to unlimited to match current behavior.
- Rejects invalid levels, class counts, XP values, awards, and max-level arguments.

## What it intentionally does not do
- Keeps the current live XP curve and per-level recalculation behavior. It does not change character saves, abilities, death behavior, or combat.
- Does not introduce the proposed new class model or a level cap.
- Does not claim server authority: current Eternal Grind XP is still awarded client-side until a separate architecture decision changes that.
- Does not perform character migration. Beta migration should offer a preview and player choices (translate, start fresh with backup, or a supported legacy/defer path).

## Validation
Run with Node 22+:
`node client/dungeon/progression-core.test.mjs`

The test file is included but has not been executed in this environment; run it and perform a browser regression check before merging.

This is an isolated rules foundation. Integration should be a separate reviewed step after the helper's behavior is approved.
