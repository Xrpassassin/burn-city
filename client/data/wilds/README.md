# BURN City: The Wilds — milestone 1

Data-driven content for the Cinderwilds forest (north edge of the city, z ≈ 397–853).

- `creatures.json`, `quests.json` — from the Wilds design package (original names/lore, no third-party IP).
- `abilities.json` — abilities, items, affinity matchups, status effects, temperament modifiers, bind base rates.

Code: `client/js/wilds.js` (world, creatures AI, UI), `wilds-rules.js` (pure rules + local save, unit-tested by
`node tools/wilds/rules.test.mjs`), `wilds-creatures.js` (procedural rigs + animation), `wilds-audio.js` (music + ambience).
Music: `client/music/wilds/` (Derrik's "Whispers of the Wilderness" = exploring, "Beneath the Hollow" = encounters), MP3 128 kbps.

Save: localStorage key `bcWilds`, versioned (`v: 1`), LOCAL-ONLY. Nothing is sent to the server, so XP, roster and
quest rewards are not competitive or account-bound yet. Quest rewards flip ready → done before payout (claim once).
Controls: walk into the trailhead → PROCEED; E/USE inspect · talk · rest; R or tap the HUD for the journal;
in encounters 1–3 moves, B bind, I odds, F flee, Enter continue.
