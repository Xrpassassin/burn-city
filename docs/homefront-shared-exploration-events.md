# Homefront: shared building events and personal evidence

## What changes

- **Co-op environment events:** Catalog-authored switches, clues, inspections, searches and latches create short-lived event records in the shared building's server-owned state. Everyone inside receives the same latest event via the existing world and building-presence snapshots; the outside world receives no interior event feed. A small toast appears at the top of the 3D viewport and expires. Existing synthesized audio provides a brief mechanical click or alarm cue.
- **Threat pressure:** High-noise actions (the Exchange Market shutter, generator switches and mechanical latches) raise an existing server-owned noise value for currently active survivors in the *same* building, consumed by the existing infected director on later world ticks. No client-supplied noise amount or global server event broadcast is accepted; this does **not** teleport infected directly inside.
- **Personal evidence:** Each authenticated survivor finds and records clues in their own interior progression. The Field Journal retrieves validated evidence IDs and authored notes from the server. Previously discovered clues are no longer repeatable action triggers.
- **No loot duplication:** This does not change existing one-time searches, field survey rewards, inventory stack sizes, shared doors, or movement authority.
- **Performance and privacy:** Max six events per building, 30-second visibility window, existing 2.4-second building-poll refresh, no extra broadcast or WebSocket. Alert text comes solely from the authored catalog. Short toast avoids overlapping the mobile movement controls; no new fullscreen panel.

## QA

Enter Exchange Market with two accounts. From the market floor, activate its rolling shutter once; both accounts should see/hear the same alarm, and their noise pressure should increase on the next server tick. The actor cannot trigger the same alarm repeatedly. Leave with one account and verify the outside player no longer receives live interior events.

Individually discover the Bus Depot route board; only the discovering account should receive its Field Journal entry. The other account can independently inspect the board and collect its personal clue. Check that existing doors, loot, and ammunition are unchanged and that mobile contextual controls remain unobstructed.

**Limitations:** The existing director responds to noise on later ticks; this does not add a physically synchronized zombie navigation AI or realtime 3D positional alarm audio source. Those are future milestones after multiplayer playtesting.
