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

## Reference-art match pass (bc-v119-nftmatch)

User feedback: NFT-owner avatars looked cartoonish next to the real art. Public token metadata and
images were pulled read-only from the XRP Ledger (issuer/taxon from `server/nft.js`, via public
`account_nfts` / `account_tx` on xrplcluster.com) and the public Pinata IPFS gateway, and reviewed
**outside the repo**. No NFT artwork, crops or textures were copied into this repository; the
procedural models only take proportions, palette and trait placement from that review.

What the art showed, and what changed:

- **589 Protocol** (5 tokens reviewed): realistic human streetwear portraits. Skin follows the
  `Body` trait (Flame On = molten yellow, Heating Up = red-brown, About To Burn = dark red-brown,
  Cool Off = grey). Tees over dark denim (short sleeves, bare forearms); grey "Burn XRP Fitted" cap
  with red front logo; orange mohawk; Punk Burner black vest over white tee; thin gold Burn Chain
  worn on the chest; heavy-lidded "Fr" stare; small flame licks off the shoulders/cap.
- **Firekeepers** (5 tokens reviewed): broad, muscular bare-chested warriors (or armored / suited),
  gold tribal linework, gold neck rings or a flame collar, flaming heads, great helm for "Helmet".
  The robe silhouette is now only used when a token actually has a robe trait.
- **RACC** (4 tokens reviewed, mostly 1:1 customs): grey-furred anthropomorphic raccoon, black
  mask, big blue eyes and ringed tail. The big eyes are the collection's own style and were kept;
  limbs are now fur instead of the outfit colour, with dark paws.
- Cartoon cues removed for human collections: catch-light glints, contrasting ball knees and
  shoulder caps, emissive yellow chain ring, orange "clown" cheek streaks (now only for Firekeepers
  with Flaming Eyes), oversized shirt-front flame decals.

No new third-party code was used in this pass (three.js primitives only, MIT).

## v120 nftheads: sculpted per-NFT heads

- **Sculpted heads** (`client/js/nft-avatar-sculpt.js`, `client/js/nft-avatar-head-specs.js`): original code. Heads are
  signed-distance fields (ellipsoids + round cones, polynomial smooth-min / smooth-subtraction) meshed by ray-casting a
  subdivided sphere onto the surface, with smooth normals and soft per-primitive vertex colours. The SDF formulas follow
  Inigo Quilez's public write-ups (iquilezles.org: "distance functions", "smooth minimum"); re-implemented, no code copied.
- **Firekeepers 1/1 specs** (`client/js/nft-avatar-firekeepers-1of1.js`): shape/colour parameters written by reviewing each
  token's own art and metadata (fetched from the token URIs via the Pinata IPFS gateway). No NFT art is stored in the repo.
- **Krea image-to-3D**: not used. The connected Krea account has 0 compute units (quotes were 166.7–222.2 CU per
  generation), so 0 credits were spent and no generated GLBs ship in this build.
- **skill-issue.in**: reviewed; it offers design/frontend/agent skills only, with no three.js/WebGL code relevant here.
  Nothing taken.
- No third-party code was added in this release.
