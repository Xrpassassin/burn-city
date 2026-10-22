# Enemy model selection: first production pilot

## Decision

**Pilot the Bat first, but only behind a visual/model feature flag and only after runtime checks.** Keep Slime and Dragon in the workshop for now. Do not replace the existing sprite enemy path in this change.

This is a role-fit decision from the current asset set and known game architecture, not a claim that the models have been visually tested in the running game. The live dungeon currently uses enemy sprites, and the workshop has not yet been browser/mobile tested.

## Candidate scorecard

Scores are provisional (1 = weak, 5 = strong). “Role fit” means fit for a first low-risk experiment in the current dark-fantasy dungeon—not a final art-quality judgment.

| Model | Role fit | Performance risk | Visual fit | Recommendation |
|---|---:|---:|---:|---|
| **Bat** | 4/5 | 2/5 | 3/5 | First pilot: small, distinct flying/skirmisher silhouette; easy to compare with the existing sprite fallback |
| **Slime** | 3/5 | 1/5 | 2/5 | Second pilot: lightweight creature, but reads more playful than the current undead dungeon unless recolored/material-treated |
| **Dragon** | 2/5 | 4/5 | 3/5 | Hold: large silhouette and boss potential, but greater animation/orientation/performance risk and less useful for validating a normal enemy |

Performance-risk scores are qualitative expectations based on role/size, not measured triangle counts or device benchmarks. Inspect each GLB's actual geometry and animation clips before using these scores as engineering estimates.

## Integration gates

1. **Workshop validation:** confirm each model loads, faces the right direction, fits the floor, and has usable idle/movement/attack/death clips. Verify color, emissive, and wireframe controls.
2. **Binary assets:** replace base64 text payloads with real binary GLB files before shipping; preserve the CC0 provenance record.
3. **Single-enemy prototype:** add Bat as an opt-in visual for one existing enemy type. Keep its existing server-authoritative health, aggro, attacks, damage, loot, and save/progression behavior unchanged.
4. **Fallback:** keep the sprite path as default and automatic fallback if the model fails or reduced-motion/low-performance settings request it.
5. **Validation:** run the project test suite; test desktop and a mobile device; measure model load time and frame rate with multiple enemies.
6. **Decision review:** only enable by default if it passes the checks. Then evaluate Slime as a second low-cost visual. Keep Dragon for a dedicated elite/boss experiment later.

## Non-goals

- No second combat engine or client-authoritative damage.
- No global replacement of enemy sprites.
- No new animation assumptions in server protocol.
- No production activation based solely on the workshop mock-up.

## Asset provenance

The Bat, Slime, and Dragon workshop assets are attributed to Quaternius's LowPoly Animated Monsters collection, listed as CC0 1.0: https://quaternius.itch.io/lowpoly-animated-monsters. See `assets/enemy-models/PROVENANCE.txt`. The imported GLBs came through a public conversion repository; retain that provenance note with the files.
