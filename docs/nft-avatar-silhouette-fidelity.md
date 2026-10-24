# NFT avatar silhouette fidelity pass

## Why this pass exists
The runtime avatar builder is procedural Three.js geometry. It can express many traits, but generic shoulder pads, a bright emissive belt, pocket blocks, and a large artwork panel had made distinct NFTs look too similar and obscured the reconstructed body. More importantly, treating trait names and values as one string could make a background named "Burn" accidentally trigger head flames or a Protocol logo.

## Changes in this pass
- Remove universal metallic shoulder pads; use garment-colored shoulder volume. Armor plates remain outfit-trait-gated.
- Replace the always-bright accent belt with a neutral belt and replace default pocket blocks with subtle seams.
- Keep the original NFT art as a separate reference portrait; make the torso artwork panel opt-in for QA and ensure the QA page passes the actual source URL to the builder.
- Keep trait names and trait values separate when deciding whether to render collection details. A background value cannot trigger flame, headwear, or logo geometry.
- Prevent arbitrary custom body-effect values from being interpreted as flames and prevent unknown weapons from defaulting to a gun.
- Add QA-only wireframe markers for unsupported headwear/accessory/weapon traits. These markers are never shown in the in-game avatar; the QA report lists traits that still need dedicated geometry.
- Gate Firekeepers' cowl, mantle, and relic details on the corresponding token traits, while retaining the collection's core layered robe silhouette.
- Gate 589 Protocol insignia and tactical straps on identity-bearing or gear traits; only add a BURN pendant when the chain/accessory trait actually calls for it.
- Normalize collection keys consistently across trait adapters and renderer.
- Bump the service-worker cache version so clients can fetch the corrected files.

## Validation
Run `npm run test:nft-avatar`. The suite checks typed trait normalization, collection reconstruction, model build specifications, asset intake, and geometry rules. Passing tests confirm logic and invariants; they do not prove visual likeness.

## What this does not claim
This is a conservative trait-mapping and silhouette cleanup, not photorealistic or pixel-perfect reconstruction. The procedural base still cannot match every token exactly. The separate Blender GLB pipeline remains a blockout pipeline until actual source art is reviewed, real collection-specific models are authored or reconstructed, rigged, optimized, and approved. The current metadata manifests intentionally contain no approved model assets, and the existing `model3d` URLs are retained as metadata rather than automatically loaded by the game.

## Required visual review before merge
Open `client/nft-avatar-visual-qa.html` in a WebGL-enabled browser. Load the exact token JSON and original artwork URL for each sample. Compare front, three-quarter, side, and rear views:
- RACC: head/mask/muzzle/ears/tail proportions, fur colors and actual outfit traits.
- Firekeepers: robe layers, cowl only where specified, flame hue/intensity, relic placement and face visibility.
- 589 Protocol: streetwear, chain, actual headwear, expression and body-effect state.
- At least one rare accessory and one non-square source image.
Record mismatches and verify that every unsupported trait is surfaced rather than silently replaced with a generic object. Do not call the models production-ready until a human reviewer confirms the rendered result in-game and mobile performance is profiled.


## Trait-grounded proportion rule

An NFT identifier may seed stable identity metadata, but it must not randomly change the character's anatomy. When body-build or face-shape traits are absent, the renderer now uses the collection's authored baseline proportions. Only explicit token metadata or reviewed collection-specific reconstruction rules may change those proportions. This avoids making two visually identical source NFTs look different for an arbitrary hash-based reason. It improves consistency, but does not establish exact likeness without reference-art review.
