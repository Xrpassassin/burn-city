# Eternal Grind Progression Architecture Audit

**Status:** design/audit only. No runtime behavior or save format is changed by this document.
**Purpose:** establish the current implementation boundary before adding the proposed class/specialization progression system.

## Executive finding

BURN City has multiple game systems that should not be conflated:

1. The Node server's `server/game.js` is the authoritative simulation for the multiplayer arena modes (including Zombies and Tron). It is not the Eternal Grind RPG's progression engine.
2. Eternal Grind is served at `/dungeon/`; its main client entry is `client/dungeon/index.html`. The existing character creator already has class selection, spells/abilities, level/experience concepts, and a device-local save key named `egSave`.
3. The separate Wilds/creature RPG rules live in `client/js/wilds-rules.js`. They include player and companion XP/levels, quests and reward claims, and a versioned local save under `bcWilds`. This is a second progression/save domain, not automatically the same character system as Eternal Grind.

**Recommendation:** do not add a second set of levels, attributes, classes, or save fields to the live game until the existing Eternal Grind rules and save lifecycle are mapped. The next safe coding step is a small, pure rules module with tests, adapted to the actual Eternal Grind data contract—not a server rewrite or immediate migration to a new character schema.

## Evidence from the repository

### 1. Server boundary

- `package.json` starts the app with `node server/server.js`.
- `server/game.js` describes itself as the authoritative simulation for both arena modes and owns arena state, collisions, and damage.
- `HANDOFF.md` lists `server/game.js` as the arena simulation and `client/dungeon/` as Eternal Grind.
- Therefore, putting Eternal Grind class progression directly into the arena `Room` simulation would couple unrelated game modes and is not justified by the current layout.

### 2. Eternal Grind client

- Entry point: `client/dungeon/index.html`.
- The current character creator includes race/class selection and displays class abilities. Its existing class logic includes multi-class behavior and an experience modifier for additional classes.
- The handoff documents `localStorage.egSave` as the Eternal Grind save and character export reads that same key.
- This means class/level/XP features are not a blank slate. New progression rules must first be reconciled with existing class selection, XP thresholds, spells, current stats, save/import/export, and any inventory/combat expectations.

### 3. Wilds/creature RPG client

- Rules module: `client/js/wilds-rules.js`.
- It exports player and companion XP threshold functions (`playerNeed`, `compNeed`), XP award functions, quest claim logic, and state operations.
- The visible save shape starts with a version, player level/XP/HP, roster, active companion, and ID counter; its own persistence is separate from Eternal Grind's `egSave`.
- The repository handoff describes `localStorage.bcWilds` as a versioned, device-local save with migration support.
- This is useful precedent for pure rules and versioned migrations, but it is not evidence that Wilds and Eternal Grind share a character schema.

## Current-vs-proposed decision table

| Area | Current evidence | Proposed system implication |
|---|---|---|
| Class model | Eternal Grind already has class selection, multi-class behavior, and class-linked abilities | First decide whether the new class + specialization model replaces, extends, or remains separate from the current multi-class system. Do not silently remove multi-class saves. |
| Level / XP | Eternal Grind has existing level/XP behavior; Wilds has its own level/XP rules | Reuse or deliberately migrate existing thresholds. Avoid two XP award paths for the same activity. |
| Attributes / stats | Existing combat and class descriptions derive behavior from current game rules | Map Might, Vitality, Agility, Intellect, and Spirit to actual current stat fields before choosing storage names or formulas. |
| Specializations | Proposed, not verified as implemented in Eternal Grind | Store stable IDs, validate against a server/shared allowlist if authoritative, and define how old saves acquire a specialization. |
| Weapon proficiency | Proposed | Identify the actual weapon inventory and combat event hooks first. Do not award proficiency from client-reported hits. |
| Respecs | Proposed limited respec policy | Define a transaction boundary and persistent cost/token ledger before enabling respecs. |
| Death recovery | Proposed temporary penalty, no permanent gear loss | Identify the current death/respawn and inventory code first. Never attach this policy to arena death without explicit design intent. |
| Persistence | Eternal Grind `egSave`; Wilds `bcWilds`; server persistent data also exists for other features | Keep each save domain separate until an explicit account/character identity and migration strategy exists. |
| Authority | Arena simulation is server-authoritative; the documented RPG saves are client-local | Server-authoritative RPG progression requires a new trust/persistence design. Do not describe localStorage progression as secure or multiplayer-authoritative. |

## Guardrails for the implementation

1. **No broad rewrite.** Preserve existing Eternal Grind combat, UI, class selection, spells, inventory, and import/export until a compatibility plan is approved.
2. **No silent save reset.** Any changed save contract must include a versioned, tested migration and a backup/rollback path. Legacy saves should continue to load.
3. **One source of truth per mechanic.** XP thresholds, level-up application, stat calculation, and ability unlocks should each have one canonical implementation.
4. **Validate IDs and numbers.** Reject unknown class/spec/ability IDs, non-finite XP, negative rewards, and level overflow.
5. **Idempotent rewards.** A quest or encounter reward must not be claimable repeatedly because of duplicate UI actions, reconnects, or retried messages.
6. **Do not trust the browser for competitive rewards.** If progression affects shared multiplayer, trading, PvP, or valuable items, the server must validate the event and calculate the reward. A local pure module alone does not provide authority.
7. **Avoid scope leakage.** Arena Zombies/Tron progression, Eternal Grind character progression, and Wilds companion progression remain separate unless the game design explicitly unifies them.
8. **No production balance claims.** The proposed level cap of 50, attribute names, six class names, XP curve, respec price, and 2–5 minute recovery window are unapproved tuning proposals until playtested.

## Recommended next implementation sequence

### Phase 0 — complete the source map

Before editing gameplay code, inspect the current `client/dungeon/index.html` blocks for:

- class and race definitions;
- save initialization, load validation, migration, export/import;
- XP thresholds and all XP award call sites;
- stat derivation and level-up effects;
- spell/ability unlock and use validation;
- death, respawn, inventory, and gear handling;
- any existing automated tests or test hooks.

Record exact function names and current save examples. This audit document does not claim those call sites have all been exhaustively enumerated.

### Phase 1 — pure rules module + tests

Create a small dependency-free module only after the source map. It should calculate thresholds, validate progression input, calculate a level-up result, and produce deterministic outputs. It must not touch DOM, localStorage, WebSocket state, inventory, or live combat directly.

Tests should cover threshold boundaries, multiple level-ups from one award, max-level overflow, malformed values, unknown IDs, and deterministic repeat calls.

### Phase 2 — compatibility adapter

Add a thin adapter around the current Eternal Grind save structure. Preserve the current schema where possible; otherwise introduce an explicit versioned migration with fixtures for old saves and import/export round trips.

### Phase 3 — one vertical slice

Implement one class and two abilities through the existing combat path. Test keyboard and mobile controls, old saves, death/recovery, and multiplayer behavior where relevant. Keep the feature behind a reversible flag until reviewed.

### Phase 4 — expand only after validation

Add specialization choices, weapon proficiency, respec ledger, and additional classes incrementally. Do not add all six classes before the first class has passed compatibility and balance testing.

## Hark review checklist

- [ ] Confirm the current Eternal Grind class system is multi-class and explain what would break if it were replaced.
- [ ] Provide exact function names/line ranges for save load/save, XP thresholds/awards, stat calculation, ability use, death/respawn, and inventory.
- [ ] Confirm whether Eternal Grind progression is entirely client-local today or if another persistence path exists.
- [ ] Identify existing tests and the smallest testable rules seam.
- [ ] Recommend a migration that loads existing `egSave` data without wiping or duplicating XP.
- [ ] Identify any existing weapon/loot mechanics before proposing proficiency or recovery changes.
- [ ] Return a file-by-file plan and risks before editing runtime code.

## Acceptance criteria for the next code PR

- No changes to the live save schema until old-save fixtures exist.
- No new class/XP system duplicates the current rules.
- Pure progression tests run under the repository's existing Node version without adding dependencies.
- Existing project test commands and server syntax checks remain green.
- Handoff explicitly says whether the change is design-only, tested, merged, and deployed; never infer one status from another.


## Beta migration policy — player choice, not forced preservation

The project is in beta. A progression redesign is allowed; compatibility is a product decision, not a requirement to keep every legacy rule forever. **However, existing players should be offered clear choices for translating their characters.**

When the new progression model is ready, present a migration preview with at least these options:

1. **Translate my character** — map the existing character into the new class/specialization system using a documented conversion table. Show the resulting class, specialization, level, XP, attributes, abilities, and any currency/inventory changes before confirmation.
2. **Keep a legacy path (if supportable)** — retain the old character model for a clearly explained transition period or separate legacy mode. Do not promise this option until it is technically practical and does not compromise shared multiplayer balance.
3. **Start fresh** — create a new-model character while retaining the old character backup/export so the player can return to it during beta.
4. **Export/decide later** — let players download their current character data and defer migration until a stated deadline, if the live beta schedule permits.

### Migration UX and safety rules

- Show a before/after comparison and explain that beta balance, class names, abilities, and progression may change.
- Create a recoverable backup before any migration; never silently overwrite the only copy.
- Make the choice explicit and idempotent: repeated confirmation/retry must not duplicate XP, currency, items, unlocks, or migration grants.
- Document the conversion table. Do not imply every old class combination has a perfect one-to-one equivalent; offer a player-selected choice when mapping is ambiguous.
- If a legacy mode cannot be supported safely, say so honestly and provide a generous, clearly communicated translation/reset option rather than implying permanent preservation.
- Keep gear and inventory unless the new model genuinely cannot support an item; in that case, show the conversion or compensation before confirmation.
- Keep migration separate from the first pure XP rules extraction. First test the new rules, then build and test a migration adapter with representative legacy-save fixtures.
- This is a beta character-migration plan, not an instruction to preserve current progression formulas indefinitely.
