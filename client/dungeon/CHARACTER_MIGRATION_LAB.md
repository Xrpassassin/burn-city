# Character migration preview lab

**Status:** isolated prototype; not connected to production save/load or character conversion.

## Purpose
Let the team inspect an existing Eternal Grind save, see the legacy class(es), review possible proposed class destinations, and compare a chosen destination with the data that should be accounted for. The player must choose; the tool never silently picks a class.

## Safety boundaries
- The prototype accepts a manually pasted JSON save only.
- It does not read or write `localStorage.egSave`, call `save()`, or alter the pasted object.
- It does not create a migrated save or claim that items/stats are compatible.
- It displays a summary of level, XP, race, gold, deepest floor, equipped item count, occupied bag slots, materials, and potions where present.
- Class mappings are intentionally many-to-many. They are candidate prompts, not final class-balance decisions.
- Before production use, define item compatibility, stat recalculation, unsupported item compensation, save backups, idempotency, and rollback.

## Try it
Open `character-migration-lab.html` from a development checkout and paste a JSON export of a character save. Choose a proposed destination class and inspect the preview. No data is written.

## Test
Run `node client/dungeon/character-migration-preview.test.mjs` with Node 22+.
