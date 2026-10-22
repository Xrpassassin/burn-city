# Staged migration writer prototype

**Status:** isolated prototype only. Not imported by the game and not connected to live saves.

Run the unit tests with Node 22+:

`node client/dungeon/migration-staged-writer.test.mjs`

## Design
- Requires explicit confirmation, source snapshot/digest, ruleset ID, unique attempt ID, a candidate validator and digest function.
- Uses injected storage; it does not access `window` or `localStorage`.
- Writes an attempt-specific backup before staging a candidate.
- Writes a pending record, reads it back, validates the staged candidate, then replaces the active save key and verifies it.
- Records a receipt for idempotency and can recover a crash after promotion but before receipt creation.
- Leaves backup/pending data in place on failures rather than attempting a risky automatic rollback.

## Limitations before production
- Tests use an FNV-like deterministic stand-in, not cryptographic SHA-256. Production must inject Web Crypto SHA-256 and handle its asynchronous API.
- Caller must provide a complete schema validator and a genuinely approved game-ready candidate. The current preview planner does not produce one.
- Storage quota, disabled storage, browser termination and partial-write recovery still require browser-level tests.
- The active key replacement is one storage operation, but backup, pending, active and receipt keys are not a multi-key transaction.
- No automatic cleanup, cloud backup, account identity, telemetry, or live integration.
