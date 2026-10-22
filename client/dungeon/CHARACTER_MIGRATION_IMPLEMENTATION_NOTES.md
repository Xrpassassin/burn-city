# Character migration preview: next engineering step

The existing `character-migration-lab.html` is intentionally read-only and accepts pasted JSON. It is not the player-facing migration UI.

Before implementing any live conversion, follow `docs/design/ETERNAL_GRIND_BETA_MIGRATION_SAFETY_CONTRACT.md`. In particular:

- Do not read/write `localStorage.egSave` from the current lab.
- Do not label localStorage backups as cloud backups.
- Show a complete item-by-item before/after diff in production; the lab's summary counts are only for early design review.
- Do not silently map legacy multiclass combinations.
- Do not mutate the active save until the source snapshot is backed up, candidate validated, and player confirmation received.
- Implement and test a staged writer with crash recovery before enabling any migration flag.

Current production saves are device-local. The export is the only portable recovery mechanism until an account-backed character system exists.
