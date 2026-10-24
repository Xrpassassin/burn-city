# BURN City realistic NFT walker avatars

## Scope

This draft upgrades the characters seen while exploring BURN City. It uses the existing wallet-verified NFT selection and /api/nft metadata pipeline for the supported RACC, Firekeepers and 589 Protocol collections. No new collection is trusted from client-supplied metadata, and ownership verification remains server-side.

## Changes

- Replaced the mostly rectangular NFT mannequin with a smoother articulated character: rounded torso, shoulder/hip transitions, capsule limbs, joints, boots, hands and facial details.
- RACC gets a dedicated rounded raccoon head, eye mask (including the red-mask trait), muzzle, ears and segmented tail. Human-style Firekeepers/589 variants use facial planes, eyes, ears, hair/beard hints and collection-specific ember/BURN accents.
- Maps available trait values to headwear, crowns, hoods, horns, eyewear, flames, jewelry, armor, fur and capes.
- Places the NFT's actual image on the character as a circular chest medallion; the floating portrait remains an optional peer identity card. The verified NFT image is still the canonical art, not a generated substitute.
- The local selected NFT avatar animates while walking; remote NFT avatars use the same articulated walk/idle behavior.
- Caches shared geometry/materials and image textures. Adds reduced sphere/capsule detail for mobile/low quality, and limits detailed peer NFT avatars to 8 desktop / 4 mobile, within 120 world units. Distant/inactive peers retain the existing lightweight marker/walker fallback.
- Bumps the service-worker cache version to bc-v94-nftavatars.

## Compatibility and licensing

- Preserves the existing NFT picker, verified ownership path, wallet selection and supported collection IDs.
- No new dependencies, runtime CDN model requests, or third-party model files were added. The avatar uses the project's existing Three.js runtime and procedural geometry, avoiding an unverified asset license.
- This is a more detailed stylized game character, not yet a photorealistic scan or a one-to-one 3D reconstruction of every PFP. Trait metadata is incomplete/inconsistent across NFT sets, so the image medallion preserves exact artwork while trait matches provide a best-effort 3D representation.

## Validation

- Adds client/js/nftchar.test.mjs, a dependency-free architecture/regression test for geometry, collection-specific variants, trait mapping, artwork overlay, animation, mobile detail and cache version.
- Adds the test to npm test and npm run test:all.
- Browser/WebGL visual review and mobile frame-time checks remain required. The test does not prove that all remote image URLs load or that every collection's trait vocabulary is fully represented.
