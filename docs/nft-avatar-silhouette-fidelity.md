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


## Color and pattern fidelity

Trait color interpretation now recognizes additional common NFT palette names (including crimson, burgundy, navy, cobalt, emerald, ivory, and charcoal). When a dedicated pattern/marking trait exists, its color takes precedence over a clothing trait; outfit color is only a fallback. This prevents trait order from silently assigning sweater or armor colors to independent markings.


## Complete trait-disposition audit

The avatar profile now emits a record for every original NFT trait, preserving the original type and value and assigning a disposition:
- `visualized`: mapped to the collection-aware 3D renderer/material logic.
- `artwork-only`: retained in the original artwork rather than falsely treated as wearable geometry (for example, a background scene).
- `collection-identity`: used to select the correct collection recipe.
- `needs-dedicated-visual`: the renderer cannot yet represent that trait value faithfully, or its type has no explicit renderer mapping.

The visual QA page prints this trait-by-trait audit so a reviewer can find omissions instead of assuming every trait rendered. This is an audit aid, not proof of visual accuracy; trait classifications and the rendered result still require side-by-side review against the actual NFT.


## Stricter value-level trait fidelity audit

The trait audit now flags unsupported values in addition to unknown trait names. Custom tail and hair styles, unknown expressions, unfamiliar markings, and unrecognized eye-appearance values are marked for dedicated modeling rather than counted as faithfully represented simply because a broad slot exists. A supported slot is not proof that every possible value has been reconstructed; the audit must remain honest about value-level gaps.
