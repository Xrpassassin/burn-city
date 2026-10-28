# NFT avatar polish: bake, shading and credits

## What changed (bc-v118-nftpolish)
- `client/js/avatar-bake.js` (new): after `buildNftChar` assembles its procedural parts, `bakeAvatar()` merges every
  static mesh into one skinned mesh per material family (cloth / satin / metal / glow). Each non-mesh group
  (hip, knee, shoulder, elbow, head, tail) is a bone, so the existing `userData.anim` / `poseWalker` code that
  rotates those groups is unchanged. Textured, transparent, wireframe (QA) and animated-flame meshes are left as-is.
  `buildNftChar(n, { bake: false })` keeps the raw parts for debugging and visual QA.
- Shading: a soft view-space rim light, added through `onBeforeCompile` on the shared avatar materials, plus
  per-vertex occlusion baked at merge time (darker undersides and lower legs). The default walker's standard
  materials get the same rim term.
- Detail: shoes with soles and toe caps, hands with a thumb (plus three fingers on the full-quality model), pupils
  and catch-lights on human eyes. The ember "face band" is now two thin under-eye streaks. The default walker has a
  rounded pelvis, rounded boots on full quality, and smoother hands.

## Measured per avatar (headless SwiftShader, no shadows; draw calls / triangles)
| avatar | before full | after full | before lite (phones) | after lite |
|---|---|---|---|---|
| RACC | 115 / 23.8k | 4 / 24.7k | 115 / 11.7k | 4 / 11.4k |
| Firekeepers | 63 / 16.6k | 8 / 17.8k | 63 / 8.2k | 8 / 8.7k |
| 589 Protocol | 83 / 18.4k | 8 / 19.6k | 83 / 9.7k | 8 / 9.9k |
| default walker | 23 / 1.1k | 23 / 1.5k | 18 / 758 | 18 / 822 |

The same reduction applies to the shadow pass, because the parts cast shadows.

## Open-source used
- **three.js** (MIT, already vendored in `client/vendor/three`): `SkinnedMesh`, `Skeleton`, `BufferGeometry`,
  `onBeforeCompile`. The merge loop follows the BufferGeometryUtils `mergeGeometries` approach
  (bake each part's transform into its vertices, then concatenate with an offset index). It is written inline
  so that pages whose import map lacks `three/addons/` (arena, QA page) keep working.
- **CloudAI-X/threejs-skills** (MIT): `threejs-performance` (static merging trades culling granularity
  for draw calls) and `threejs-shaders` (`onBeforeCompile` injection at `#include <opaque_fragment>`,
  `customProgramCacheKey`, view-space rim). Found through https://skill-issue.in/. These are guidance only; no code copied.
- No third-party models, textures, GPL code or Mixamo files were added.
