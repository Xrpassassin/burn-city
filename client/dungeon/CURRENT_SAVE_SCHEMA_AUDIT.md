# Eternal Grind save schema audit (current source)

**Scope:** source-backed inventory of the current browser save format. This is an audit of the existing game, not an approved target schema or conversion ruleset.

## Save location and lifecycle

- The live game reads and writes the raw JSON string at `localStorage.egSave`.
- `client/dungeon/index.html` saves a shallow copy of the player object, clamps persisted HP to at least 1, and removes derived runtime fields `st`, `fx`, and `procs` before serialization.
- The title screen offers a JSON export. Import calls the current `S.migrate` helper, asks before replacing an existing save, copies the current raw save to `egSaveBak`, then writes the imported raw JSON and reloads.
- The current loader runs `S.migrate(JSON.parse(raw))`. For old saves it keeps the original raw JSON in `egSaveV1` once. Unreadable data is parked in `egSaveBroken` if that key is empty.
- `egSaveBak`, `egSaveV1`, and `egSaveBroken` are device/browser-local recovery keys, not cloud backups. Exported JSON is portable. The current code does not provide account-backed character storage.
- Save schema version is `v: 2`. `S.migrate` accepts broad older inputs and performs repairs in place; the new beta migration planner deliberately has a stricter allowlist and must not treat the existing helper as proof that every field is safely understood.

## Field-by-field inventory

| Field | Current meaning / shape | Migration requirement |
|---|---|---|
| `v` | Save schema version; current new characters use `2` | Accept only explicitly supported source versions. Reject unknown/future versions without writing. |
| `name` | Character display name | Preserve exactly or show any normalization in the preview. |
| `race` | One of human, ashenborn, stonefolk, wildkin, gloomkin, ironhide, skyborn, emberkin | Preserve if target supports it; otherwise show an explicit choice/compensation. |
| `cls`, `classes` | Primary legacy class plus up to three class IDs from warrior, rogue, ranger, mage | Never silently collapse a multi-class character. Offer an explicit mapping/choice. |
| `lvl`, `xp` | Level and current XP; XP threshold depends on class count | Decide and preview target level/XP conversion; don't assume keeping both means equivalent progress. |
| `gold` | Currency | Show exact before/after value and any cap/compensation. |
| `depth`, `best` | Current floor and deepest reached floor | Define how current run and permanent progress/unlocks transfer. |
| `hp`, `mp` | Current health and mana; derived maxima are recalculated from class/race/equipment | Recompute against target stats, then clamp; show the expected result. |
| `pots` | Two-element array: healing and mana draught counts | Validate both entries and preserve/convert explicitly. |
| `eq` | Equipped item object keyed by slots including primary, head, chest, feet, charm, neck, ring slots and additional paper-doll slots | Item-by-item mapping; validate slot/type compatibility and duplicate/unsupported items. |
| `gen` | Eight general inventory slots; may contain item objects or bags | Traverse recursively and account for every item; don't count only occupied top-level slots. |
| bag `items` | Nested item array with `size` capacity | Preserve all nested items and bag capacity or show overflow handling. |
| item fields | Generated items use `id`, `t`, `n`, `r`, `s`, `up`, optional `fx`, and `v`; bags also use `size` and `items` | Validate every field, supported type, rarity, stats, upgrade, effect and sale value. Never silently drop item identity or effects. |
| `mats` | Resource object with `ore` and `shard` counts | Validate counts and define target conversion/compensation. |
| `codex` | Learned item-effect IDs | Map every effect ID or explicitly compensate. |
| `gems` | Eight ability/spell IDs or null entries | Map ability IDs and slot ordering; unsupported skills must be shown. |
| `hot` | Ten hotbar entries such as `pot:0`, `pot:1`, and `gem:0`…`gem:7` | Remap references after ability/item mapping; don't leave broken hotbar links. |
| `diff` | Run difficulty tier, clamped to 0–4 by current migration helper | Decide whether target has equivalent difficulty and how to preserve it. |
| `tut` | Optional tutorial-seen marker used at floor 1 | Retain only if target tutorial semantics match. |
| `migratedFrom` | Optional marker written by the existing v1-to-v2 migration | Treat as provenance metadata, not a gameplay progression value. |

### Derived fields excluded from serialized saves

- `st`: calculated combat stats, including HP/MP maxima and equipment/race/class effects.
- `fx`: derived focus-effect bonuses.
- `procs`: derived equipment proc list.

The serializer removes these fields before writing. The migration UI should not count them as saved progression; the target game should recalculate equivalent derived state from the final approved character.

## Important current-code behaviors to preserve or explicitly replace

1. The current v1-to-v2 migration resets some values (`mats`, `codex`, `diff`, gems/hotbar defaults) and can convert inventory overflow into gold. That is existing legacy behavior, not a safe template for the beta conversion.
2. The current save object can have extra fields not enumerated above. The serializer shallow-copies `P`, so unknown fields may persist. Before production conversion, compare actual exported save fixtures and code writes to this inventory; preserve or explicitly classify every field rather than silently discarding extensions.
3. Current equipped and carried items can contain nested bag contents, upgrades and effects. A preview that shows only item counts is insufficient for player consent.
4. The current save is client-side and can be edited. Treat imports as untrusted input and fully validate them before any conversion.
5. Current character progress is not authoritative in `server/game.js`; that server handles the arena modes. Do not claim cloud or server-side RPG recovery exists.

## Release gate

Do not wire the staged writer into live saves until all of the following exist:

- Representative exported v1 and v2 fixtures, including multi-class characters, nested bags, rare/upgraded/effect items, full inventory, edge-case values, and optional fields.
- A reviewed field-by-field before/after diff and approved rules for every field above.
- Full target-save schema validation and compatibility mapping for every item and ability.
- Real cryptographic source/candidate digests, browser storage quota/failure tests, and multi-tab/source-change tests.
- Player choices for translate, start fresh while retaining the old export/backup, and defer/export where technically supported.
- Hark's review and an explicit release decision. This audit alone does not authorize conversion or merging.
