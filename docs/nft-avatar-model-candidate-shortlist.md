# NFT Avatar Model Candidate Shortlist

Status: **research candidates only — none imported or approved for shipping**.

This shortlist gives the team concrete starting points for evaluation. A candidate becomes an approved asset only after downloading the exact item/version, checking the included licence, recording provenance and file hashes, testing the actual rig/file, and passing collection-specific visual review.

## Candidate sources

| Candidate | Source | Potential use | Initial assessment | Required follow-up |
|---|---|---|---|---|
| Quaternius Ultimate Modular Men | https://quaternius.com/packs/ultimatemodularcharacters.html | 589 Protocol humanoid prototype; generic animation/rig benchmark | Official pack page lists FBX, OBJ, glTF and Blend, modular parts and CC0 | Capture exact pack page and included licence at download time; inspect topology, skeleton, proportions and texture layout |
| Quaternius Modular Character Outfits - Fantasy | https://quaternius.itch.io/modular-character-outfits-fantasy | Firekeepers clothing-layering/attachment workflow experiment, not necessarily final art | Page reports CC0 1.0 Universal; the fantasy visual style may not match Firekeepers | Check exact downloaded archive/licence, cloth clipping, rig compatibility and commercial redistribution terms |
| Blender Studio character library | https://studio.blender.org/characters/ | Reference for rigging, facial controls, and creature/humanoid topology | High-quality production examples; licences and access differ by asset | Select an exact character and read its own asset licence; do not treat the whole library as uniformly licensed |
| Kenney Mini Characters | https://kenney.nl/assets/mini-characters | Lightweight performance and animation baseline, not final collection likeness | Useful low-poly benchmark; likely style mismatch for NFT-accurate avatars | Inspect current archive and licence; test import, skeleton and animation quality |
| Kenney Animated Characters (Protagonists) | https://kenney.nl/assets/animated-characters-protagonists | Low-cost animation/runtime benchmark | Candidate for pipeline validation rather than collection-defining art | Inspect actual archive formats, licence, skeleton and retarget requirements |
| Quaternius Universal Base Characters | https://quaternius.itch.io/universal-base-characters | Alternative humanoid base/rig test for 589 or Firekeepers | Potential modular baseline; do not assume all releases share identical terms | Verify the exact release's licence and archive contents before use |

## Collection-specific recommendation

### RACC
Do **not** select a generic humanoid as the production base. Evaluate a licensed quadruped/anthropomorphic raccoon mesh or use a custom sculpt derived from reviewed RACC reference art. The model must preserve the broad raccoon skull, mask, muzzle, ears and tail silhouette. Generic humanoid packs are suitable only for testing the rig/asset pipeline.

### 589 Protocol
Start by testing a modular humanoid candidate such as Quaternius Ultimate Modular Men or Universal Base Characters. The candidate is a rig/geometry benchmark, not an approved visual base. Compare body silhouette, facial topology, clothing attachment points, animation compatibility and mobile polygon/material budgets before choosing.

### Firekeepers
Evaluate a humanoid base with a clean torso/neck rig and support for layered cloth, cowl/hood geometry and emissive effects. A modular humanoid can validate the pipeline, while the final base may need custom proportions and a separate cloth setup to avoid clipping.

## Evaluation scorecard

Score each downloaded candidate from 0–5; record evidence, not impressions alone.

- **Licence/provenance (gate):** exact licence found, commercial use and redistribution terms understood, attribution requirements recorded.
- **Silhouette fit:** resembles the collection's source art at gameplay camera distance.
- **Rig fit:** usable skeleton, clear bone names, acceptable deformation, retargeting feasibility.
- **Modularity:** clothing, headwear, masks, tails, props and effects can attach without destructive edits.
- **Runtime cost:** triangle count, draw calls/material count, texture memory and load size.
- **Pipeline fit:** imports cleanly to the game's renderer; units, pivots, normals, UVs and texture paths are correct.
- **Trait coverage:** can represent the actual collection traits without inventing or collapsing meaningful differences.

Reject a candidate if the licence is missing or unclear, source provenance cannot be established, the file is technically unsafe, or its silhouette cannot be adapted without losing collection identity. A high aggregate score never overrides the licence gate.

## Suggested first prototype

1. Download one humanoid candidate from a source page with a clearly stated licence and archive it with date/version evidence.
2. Run it through the asset intake validator with `rights.status: "pending-review"`; do not mark rights reviewed until a human has checked the exact file and terms.
3. Import it into a temporary scene and inspect front/side/three-quarter silhouettes, bone hierarchy, bind pose, materials and animations.
4. Build a throwaway trait attachment test for headwear, outfit, and held prop; measure clipping and runtime cost.
5. Compare the prototype against collection reference artwork and decide whether to adapt or reject.
6. Only then create the production asset record. Keep candidates separate from approved manifest assets.

## Source notes

- Quaternius Ultimate Modular Men official page advertises modular models, common 3D formats and CC0: https://quaternius.com/packs/ultimatemodularcharacters.html
- Quaternius Modular Character Outfits - Fantasy page lists CC0 1.0 Universal: https://quaternius.itch.io/modular-character-outfits-fantasy
- Blender Studio provides an individual character library; inspect each chosen asset's own terms: https://studio.blender.org/characters/
- Kenney source pages: https://kenney.nl/assets/mini-characters and https://kenney.nl/assets/animated-characters-protagonists

Source pages and licensing can change. Re-check the exact item at the time of download. This shortlist is not a legal determination and does not approve any third-party asset.
