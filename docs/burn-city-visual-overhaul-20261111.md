# BURN City visual fidelity — 11 November 2026

## Scope and guardrails

BURN City has multiple independent game scenes. Improvements must be judged **in the actual camera and at walking distance**, not by a model viewer. Preserve the original Zombies gameplay/renderer and use Homefront-only assets in Homefront; changing gameplay identifiers, collision, money/accounting, wallet logic or multiplayer authority is outside this art pass.

Skill Issue (https://skill-issue.in/) catalogs **agent skills**, not a verified 3D asset marketplace. Consult design and QA skill guidance, but do not execute unreviewed installers. The source of *each* third-party model/texture must be tracked separately.

## First runnable visual slice — city foliage

- Replace primitive cone tufts with 3D pointed-blade clusters, varied per district/instance, with occasional grounded wildflowers. No network requests, extra lights, physics or per-frame update.
- Preserve original deterministic placement, road/collider clearances and tier-specific counts (low 140, medium 540, high 1200).
- At most two instanced draw calls. New geometry is shared within each plant batch and disposed on exit.
- Existing `?nonature` rollback remains available. Look for clipping at lake, bridges, tower, and the Estates gateway; visual QA is still required on desktop and a real phone.

## Next visual slices (separate PRs)

| Region | Direction | Reusable building blocks | Acceptance |
| --- | --- | --- | --- |
| Original Zombies | Realistic distinct infected, wet grime, dramatic industrial lighting, controlled muzzle flash | Already bundled Sketchfab-licensed hazmat/thin models and Quaternius fallback; inspect existing model-loader pilot | Existing weapon timing, enemy attacks, map progression and original Zombies renderer unchanged; normal enemies not glowing cartoons |
| Homefront | Grounded post-apocalypse, weathered PBR materials, layered woodland, credible ruins and interiors | Existing CC0 surface textures and Kenney survival GLBs; selected Poly Haven/ambientCG CC0 sources only after audit | Continuous third-person motion remains responsive; no layout or collision regressions; low-spec frame pacing |
| Estates | Believable masonry, timber, glass and weathering, visually realized upgrades, furnishing/material variants | Existing procedural PBR microdetail, authored furniture and neighborhood instancing | Upgrades persist on reload, align with purchase state; no wallet/treasury changes |
| BURN City | Architectural material cohesion, skyline/black holes, animated ambience and legible streets | Current city/AMM objects, birds and grass renderer; original procedural geometry | Must retain token identity and strict on-chain burn verification |
| Blacktide | Harbor detail, fog, weathered ship decks, sails and coherent day-light palettes | Existing standalone Blacktide renderer, original materials; vetted CC0 props if needed | Sailing/navigation and mobile performance unaffected |
| CinderWilds / dungeon | Layered ground and rock, selective emissive lava, cohesive enemy silhouettes | Existing wilds graphics presets and terrain material lab | Camera readability and gameplay unaffected |

## Intake / performance gate

For each proposed external asset: source URL, creator, exact license and attribution, archive hash, GLB scale/orientation, texture resolution, triangle/draw-call counts, animation clips, WebGL/mobile load, collision proxy, cleanup/disposal. Do not ship non-commercial, editorial-only, unknown-license, or ripped game assets. Prefer existing vendored assets and procedural meshes before importing new dependencies.

Track desktop/mobile frame time before and after each feature; test main game, Homefront, Zombies map transition, Estates island entry/interiors, and return to city. Roll out in isolated reviewable PRs.
