# Eternal Grind Beta Character Migration Safety Contract

**Status:** implementation contract / review artifact. No production migration is implemented here.

## 1. Product promise

Beta progression may change substantially. Existing players must receive a clear choice rather than a silent or forced conversion:

1. **Translate this character** using a reviewed mapping and an explicit confirmation.
2. **Start fresh** while retaining an exportable, recoverable copy of the old character.
3. **Defer / continue legacy** only if engineering can safely support it for a documented transition window.
4. **Export and decide later** when the release schedule supports that option.

Do not promise that every old mechanic, item, stat, or multiclass combination will remain identical. Explain exactly what is retained, converted, compensated, reset, or unsupported before confirmation.

## 2. Current source boundaries

The current Eternal Grind character is stored locally under `localStorage.egSave`; the current page includes a save version and migration helper. Existing saves are device/browser-local rather than an account-wide server character. Therefore:

- A browser-local backup protects only that browser profile/device and can be lost if browser storage is cleared.
- A JSON export is the portable recovery path until account/cloud persistence exists.
- Do not describe a local backup as cloud recovery.
- Never treat the Node arena server's state as the authority for Eternal Grind character progression without a separate architecture change.

## 3. Required data flow

Use a staged process. Never mutate the only copy of the old save while the player is still deciding.

```text
Read current save
  -> validate shape and known version
  -> create immutable raw snapshot + checksum
  -> calculate candidate conversion in memory
  -> validate candidate and list all changes
  -> show before/after preview + warnings + choices
  -> player explicitly confirms one option
  -> re-check source snapshot has not changed
  -> write backup first
  -> write converted save to a separate pending key
  -> read back and validate pending save
  -> atomically promote pending save to active key
  -> record migration receipt / conversion version
  -> keep rollback/export path visible
```

This is a design sequence, not code already implemented. Browser localStorage does not offer a multi-key transaction; use a recoverable staged protocol and test interruption at every write boundary. If promotion or validation fails, keep the original active save intact and surface a recoverable error.

## 4. Snapshot and receipt

A migration attempt should capture:

- A cryptographic digest of the exact raw source string (SHA-256 where Web Crypto is available), source save version, source schema fingerprint, and migration ruleset ID.
- The untouched original raw JSON in a backup location and a downloadable export before the first destructive write.
- A generated migration attempt ID, target ruleset/version, selected target class/specialization, timestamp, and explicit player confirmation.
- A receipt listing retained, transformed, compensated, reset, and unsupported fields, plus validation results.

Do not put secrets in a receipt. The local save currently has no server identity to use as a trusted player identifier. Avoid inventing one.

## 5. Idempotency and duplicate prevention

- A given source digest + migration ruleset ID must not be applied twice to the same active character.
- Converted saves must carry an explicit migration receipt/version marker.
- If the same migration is retried after a crash, detect the matching receipt and resume/verify rather than re-awarding compensation or repeating transformations.
- Never use character name alone as identity.
- Never compensate the same unsupported item twice.
- When source data changes after preview, invalidate the preview and require a fresh one.

## 6. Before/after preview requirements

At minimum show:

| Area | Before | After |
|---|---|---|
| Identity | name, race, character/save version | retained or changed fields |
| Progression | class combination, level, XP, depth/best | chosen class, specialization, converted level/XP, any caps |
| Attributes | current derived stats | recomputed stats and deltas |
| Abilities | known spells/skills | mapped, replaced, refunded, or unavailable |
| Gear | each equipped item and slot | retained/moved/converted/compensated |
| Inventory | bag capacity and every item | retained/moved/compensated |
| Economy | gold, materials, potions | retained and any disclosed compensation |
| Access | unlocked floors/content/quests | preserved/reset/unavailable |
| Recovery | backup and export state | exact rollback method |

A count-only display is acceptable for the isolated preview lab, but is not enough for a production confirmation screen.

## 7. Mapping policy

- Existing legacy class IDs are `warrior`, `rogue`, `ranger`, and `mage`; existing characters can contain up to three selected classes.
- Proposed future classes (Vanguard, Warden, Arcanist, Ranger, Reaver, Binder) and their specializations are unapproved design candidates, not final content.
- Use many-to-many candidate mappings for legacy multiclass combinations; never auto-select an ambiguous result.
- Player choice is required where multiple mappings are reasonable.
- Convert class-dependent stats from the target ruleset, not by blindly copying legacy derived stats.
- For each ability and item, define a compatibility table. If unsupported, offer an explicit alternative or clearly calculated compensation before confirmation.
- Preserve supported gear/inventory and account for every unhandled item. Do not silently delete items or stack a new death penalty on top of a migration loss.

## 8. Validation and rollback requirements

Validate both source and candidate before promotion:

- JSON object and known schema/version; reject malformed/unknown future versions without overwrite.
- Recognized race/class IDs, valid level/XP/currency ranges, bounded arrays/objects, and finite numeric values.
- Unique item IDs where required; known equipment slots; no item duplicated across equipment and bags.
- Target class/specialization is valid and explicitly selected.
- Derived stats are recomputed by the target ruleset and within defined limits.
- Every source field is categorized as retained, converted, compensated, reset, or intentionally discarded with disclosure.
- Re-read active source immediately before commit and compare its digest to the preview digest.
- After write, parse and validate the saved candidate before promoting it.
- Recovery UI must let the player restore/export the original snapshot without needing a successful game load.

If any validation fails, abort with no active-save change. Do not automatically retry a destructive write.

## 9. Failure-injection test matrix

Test at least these interruption/failure points:

1. Invalid JSON or unsupported save version.
2. Backup write throws or storage quota is exceeded.
3. Candidate serialization fails.
4. Pending write succeeds but read-back fails.
5. Tab closes after backup, after pending write, and before promotion.
6. Active save changes after preview but before confirmation.
7. Player double-clicks confirmation or repeats a request.
8. Migration is retried after a partial attempt.
9. A bag is full and one or more items need conversion/compensation.
10. A legacy multiclass combination has several valid target classes.
11. Browser storage is disabled or unavailable.
12. Original save exists only in an export and is no longer in localStorage.

## 10. Rollout

1. **Read-only audit:** enumerate actual fields and current save-version behavior.
2. **Dry-run candidate builder:** pure deterministic function; no browser storage access.
3. **Preview UI:** item-by-item before/after and explicit choices.
4. **Backup/export and staged writer:** isolated, feature-flagged, with failure injection.
5. **Opt-in internal playtest:** use copied test saves only.
6. **Beta cohort rollout:** provide notice, export, and rollback path.
7. **Broader availability:** only after telemetry-free local validation, Hark review, and documented support procedure.

Do not add silent background migrations. Do not ship a migration that depends on a server/cloud recovery feature that does not yet exist.

## 11. Acceptance criteria

- Preview is deterministic for identical source + target + ruleset.
- Preview and cancel never write to storage.
- The original raw save is recoverable before any active-save replacement.
- Every changed or dropped field is visible before confirmation.
- No ambiguous class mapping is chosen without the player.
- Repeating the same confirmed operation does not duplicate compensation or progress.
- Storage/write/validation failure leaves the previous active save usable.
- Unknown save versions are preserved/exported and rejected safely.
- The player can choose translation or start fresh without silently destroying the prior character.
- Tests cover every failure-injection point above before production rollout.
