# NFT avatar silhouette fidelity pass

## Why this pass exists
The current runtime avatar builder is procedural Three.js geometry. It can express many traits, but the shared base silhouette accumulated generic shoulder pads, a bright emissive belt, pocket blocks, and a flat framed artwork panel. Those universal details can make different NFTs look like the same toy/armored mannequin and make the source image feel pasted onto the body.

## Changes
- Remove universal metallic shoulder pads; use garment-colored shoulder volume. Armor plates remain trait-gated under the armor outfit recipe.
- Replace the always-bright accent belt with a neutral, low-metalness belt.
- Replace the default chest zipper/pocket blocks with subtle garment seams so collection/token traits carry the visual identity.
- Change the full NFT artwork surface from a flat plane to a curved mesh that follows the torso more closely. Keep the complete source composition, original aspect-ratio fit, and no-crop rule.
- Add regression checks for these visual design rules.

## What this does not claim
This is a silhouette and artwork-integration cleanup, not photorealistic reconstruction. The procedural base still cannot match every token exactly. The separate Blender GLB pipeline remains a blockout pipeline until real exports are inspected, rigged, optimized, and approved. It is not automatically loaded by Zombies or Homefront.

## Required visual review before merge
Open `client/nft-avatar-visual-qa.html` in a WebGL-enabled browser and compare representative live source artwork for:
- RACC: head/mask/muzzle/tail proportions and outfit trait.
- Firekeepers: robe/cowl/flame silhouette and facial visibility.
- 589 Protocol: streetwear proportions, chain and headwear.
- At least one token with a rare accessory and one with a non-square source artwork.
Review front, three-quarter, side, and rear angles, then run `npm run test:nft-avatar`. Do not call this production-ready until a human reviewer confirms the rendered result in-game and mobile performance is profiled.
