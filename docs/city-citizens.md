# BURN City citizens

The capsule pedestrians in the City (the sidewalk crowd in `app.js` and the Main Street shoppers in `citylife.js`) are now drawn as CC BY 3D people. The capsule simulations still move everyone, so routes, shop visits and crowd counts are unchanged. `client/js/citizens.mjs` reads their positions and draws people in their place.

* **Far LOD:** about 1.2k triangles per model, with a 256 px texture and the walk cycle baked into a half-float vertex-animation texture. The whole crowd is one instanced draw call per model.
* **Near LOD:** up to 9k triangles, a 1024 px base color (512 px on phones), a simple humanoid skeleton (automatic weights) and in-house `Walk` and `Idle` clips. These swap in for the few people closest to the camera, from a small pool. Each rigged model is only downloaded the first time someone wearing it comes close. Pool sizes:

  | tier | near slots | near radius | far cull |
  |---|---|---|---|
  | low (phones) | 4 | 14 m | 180 m |
  | medium (phones) | 6 | 18 m | 260 m |
  | phone on High | 8 | 20 m | 300 m |
  | desktop high | 16 | 30 m | 300 m |

* **Named citizens** follow a daily life script (below). Unnamed copies just wander the sidewalks as before.
* `?citizens=0` turns this off and brings the capsules back. The capsules also come back automatically if an asset fails to load.
* Credits are on `client/city-credits.html`, linked from **Movement & Games**.

## Adding the other models

The roster is in `scripts/city-citizens/models.json`. Set `"enabled": true` on a model, then on the box run:

```
SKETCHFAB_API_TOKEN=... scripts/city-citizens/build-all.sh            # all enabled models
scripts/city-citizens/build-all.sh inked-warrior                       # just one
```

This needs Blender 4.2 on PATH. The script refuses any model that isn't CC BY 4.0, downloads the glTF, decimates and rigs it, writes the clips, and regenerates `client/assets/citizens/models.json` and `client/city-credits.html`. The token is only sent as a request header. It is never printed or committed, and isn't used in CI.

## Updating the walk cycle

The renderer advances a shared walk phase using distance traveled, so the close and distant models land on the same step when they swap. The cycle sets a planted-foot trajectory and adjusts stride for the scans with narrower stances. The pocket-side and key-holding arms have reduced swing.

Rebake the shipped rigs after editing the gait, with Blender 4.2 or later:

```sh
blender -b --python-exit-code 1 -P scripts/city-citizens/rebake_walk.py -- client/assets/citizens
```

Pass model IDs after the asset directory to rebuild only those models.

## Life script schema (`client/data/citizens/<id>.json`)

Add the id to `client/data/citizens/index.json`. Scripts that fail validation are skipped, with a console warning. The rules are in `validateCitizen()` in `client/js/citizens-core.mjs` and are tested by `npm run test:citizens`.

```json
{
  "schema": "burn-city-citizen/1",
  "id": "maya",                       // 2-40 chars: a-z 0-9 -   (must match the filename)
  "name": "Maya",                     // 1-40 chars, shown above them when you're close
  "modelId": "casual-w",              // one of client/assets/citizens/models.json ids
  "personality": "Warm early riser…", // up to 400 chars (for writers; not shown in game yet)
  "schedule": [                       // 1-24 entries, player's local clock, 24h "HH:MM"
    { "time": "06:30", "place": "shop:coffee", "activity": "Opening Hot Beans", "say": "Doors open, coffee's on!" }
  ],
  "dialogue": ["Morning! First cup's the best one."]   // up to 30 lines, 1-140 chars each
}
```

* **time:** the entry with the latest time at or before now is active. Before the first entry of the day, the last entry from the previous day stays active.
* **place:** where they walk to and then stand idle:
  * `spawn`, `police`, `fire`, `ems`, `power`
  * `shop:mart`, `shop:smoke`, `shop:disp`, `shop:coffee`, `shop:arcade`
  * `tower:<TOKEN>`, for example `tower:BURN`, `tower:IMG`, `tower:XRPyro`
* **activity:** up to 80 chars, shown next to the name ("Maya · Opening Hot Beans").
* **say:** optional, up to 140 chars. Said once when they set off for that entry (if you're within about 10 m).
* **dialogue:** random lines said every 9-15 s when you're within about 10 m.

Keep lines friendly and factual. Don't give price predictions or financial advice. Paid play is described as skill-based matchmaking.

## Models: display name → `modelId` (use the modelId in life scripts)

| modelId | Sketchfab model (artist) | Look |
|---|---|---|
| `casual-w` | Casual Confidence (restore50) | woman, orange top, blue jeans |
| `blonde-black` | Blonde In Black (restore50) | blonde woman, black top and black jeans |
| `elegance-black-b` | Elegance In Black (restore50) | woman, black sleeveless jumpsuit |
| `gothic-elegance` | Gothic Elegance (Padarozhnik) | dark-haired woman, black lace dress, stockings |
| `athletic-black` | Athletic Portrait in Black Activewear (restore50) | woman, black crop top and leggings |
| `exec-navy` | Executive in a Navy Suit (restore50) | man, navy suit and tie |
| `trekker` | Casual Trekker (restore50) | man, grey tee, olive cargo pants, boots |
| `casual-m-b` | Casual Confidence (restore50) | bearded man, navy button-up shirt, grey jeans |
| `keys-portrait` | Casual Studio Portrait With Keys (restore50) | man, black tank top, ripped jeans, keys in hand |
| `inked-warrior` | Inked Warrior (restore50) | bald bearded man, tattoos, dark tee, cargo pants |

Every model is used evenly by the unnamed crowd. Several named citizens can share one modelId.

These two were tried and left out (`"enabled": false`, with the reason in `models.json`):
* **Mustard Floral Sundress:** the scan has crossed legs, so the automatic rig mixes up the two legs.
* **Elegance in Black (pIINW):** the sandal straps join the two feet in the scan, so a web stretches between them mid-stride.

Both would need hand rigging or mesh cleanup.
