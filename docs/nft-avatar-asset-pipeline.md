# BURN City NFT Avatar Asset Pipeline

## Purpose

Make collection-specific NFT characters repeatable, reviewable, and safe to ship. The pipeline separates three concerns:

1. **Identity and ownership** — existing server-side wallet/NFT verification remains authoritative.
2. **Metadata interpretation** — raw XRPL metadata is retained while collection adapters map known traits to visual slots.
3. **Approved visual assets** — source files enter the game only after provenance, license, format, rig, scale, and performance review.

An XRPL NFToken references off-ledger data through its URI; the URI itself is not proof that an asset is safe, compatible, or licensed. See the [XRPL NFToken reference](https://xrpl.org/docs/references/protocol/data-types/nftoken) and [XLS-24 metadata structure](https://xls.xrpl.org/xls/XLS-0024-nft-metadata.html).

## Current collection manifests

- `assets/nft-avatars/collections/racc.json`
- `assets/nft-avatars/collections/fk.json`
- `assets/nft-avatars/collections/589.json`

These manifests document initial trait mappings and collection-specific QA coverage. Issuer/taxon identities are intentionally unverified placeholders until checked against authoritative ledger data. The runtime now has a separate component-recipe layer in `client/js/nft-avatar-components.js`. The adapters now recognize real collection-specific attribute names such as RACC `Armed`, `Fits`, and `Top Gear`, and 589 Protocol `Body`, `Chain`, `Clothing`, `Eye`, `Head`, and `Mouth`, rather than assuming generic names. Representative public indexed trait pages were used to establish those names; they are trait-schema examples, not an ownership allowlist. It resolves headwear, outfit silhouette, accessory, weapon class, flame color/style, tail pattern, wing style, eye treatment, expression, hairstyle, facial hair, horns/antlers, face markings, and body pattern into deterministic visual instructions. `nftchar.js` consumes those recipes for robe/armor/tailored clothing details, relic/earring/pack accessories, weapon silhouettes, and collection-aware accents. The original NFT composition is now displayed as a larger framed chest tabard, fitted with `contain` so the full artwork remains visible without cropping; trait-driven face masks are also rendered on humanoid avatars. Collection metadata can additionally drive mohawks/spikes, dreadlocks/braids, long hair, afros, buns, goatees/beards/mustaches, scars/freckles/war paint, horns/antlers, clothing patterns, 589 body-fire states and Burn Halo, plus RACC Bee Hive and TNT props. This makes each avatar's actual NFT artwork substantially more prominent, but it is still a hybrid of procedural 3D geometry and a 2D identity surface—not a true 3D reconstruction of the original character. The asset arrays are empty: no external model or layered artwork is silently treated as licensed.


### Public trait-schema examples used during adapter work

These indexed NFT records were used to verify attribute names and representative values. They are schema references only; the pipeline does not import their media or treat them as owner-approved model assets.

- [RACC GUY1979](https://xrpl.to/nft/000A271005C6E016B0AB93B24A603594F2A3989BD7503434E206777F05BF49E4): `Armed: TNT`, `Fits: Yellow Striped Sweater`, `Top Gear: RACC Lee Hat`.
- [RACC GUY390](https://xrpl.to/nft/000A271005C6E016B0AB93B24A603594F2A3989BD75034349D55047C05BF49E1): `Fits: Taxing`, `Eyewear: Lashes`, `Top Gear: Box Cap`.
- [BURN-589 #00510](https://xrpl.to/nft/00083A98CBA4A5AF2A8012786865E81067D054E55EB87419FFACCF9705B9553F): `Body: Flame On`, `Chain: Burn Chain`, `Clothing: Punk Burner`, `Eye: Fr`, `Head: Burn XRP Fitted`, `Mouth: Hmp`.
- [BURN-589 #00445](https://xrpl.to/nft/00083A98CBA4A5AF2A8012786865E81067D054E55EB8741916929C9605B95540): `Body: Flame On`, `Eye: Surprised`, `Head: Burn XRP Fitted`, `Mouth: Meh`.

## Commands

Run the standalone manifest regression test:

```sh
node scripts/nft-avatar-asset-pipeline.test.mjs
```

Validate every collection manifest:

```sh
node scripts/nft-avatar-asset-pipeline.mjs validate-all
```

Validate a single manifest:

```sh
node scripts/nft-avatar-asset-pipeline.mjs validate assets/nft-avatars/collections/racc.json
```

The validator is dependency-free. It checks collection keys, unique trait aliases, explicit collection identity state, QA sample coverage, safe repository-relative asset paths, SHA-256 digests, source URLs, rights review, redistribution permission, attribution, model format/units/rig/polycount, and animation skeleton metadata. It never downloads, parses, or executes a remote asset.

## Asset record contract

Each approved asset record must include:

- Stable `id`, `kind`, repository-relative `path`, SHA-256 digest, and HTTPS source/provenance URL.
- A rights block with a human-reviewed status, explicit license, redistribution permission, and attribution text.
- For models: approved format (GLB/glTF/FBX/OBJ), units, rigged flag, animation-compatibility flag, and measured polygon count.
- For animations: the intended skeleton identifier, followed by an actual compatibility test before integration.

A green manifest validation means the record is structurally complete, **not** that a license has been legally adjudicated or the model visually works. A reviewer must verify the source license and permission for redistribution in a multiplayer game. “Found online,” NFT ownership, and marketplace metadata do not grant those rights.

## Intake and QA workflow

1. **Sample the collection.** Obtain a project-authorized sample set spanning common traits, rare combinations, edge cases, and missing/unknown traits. Record private review references when public token IDs are not appropriate.
2. **Map semantics before geometry.** For each trait, specify its normalized render slot, visual component/material, fallback behavior, and whether it changes silhouette. Keep the original trait name/value intact.
3. **Acquire with permission.** Prefer source layered files or explicitly licensed models. Store provenance, license version/link, attribution, permission scope, and a content hash. Do not ingest assets with unclear redistribution rights.
4. **Normalize offline.** Confirm orientation, units, scale, pivot, material count, texture dimensions, polygon count, skeleton/rig, animation clips, and missing dependencies. Convert in a controlled build step; never load arbitrary source URLs as executable content.
5. **Build a representative matrix.** At minimum include base/common, rare visual traits, conflicting aliases, missing metadata, unknown traits, and multiple traits occupying the same body region.
6. **Visual QA.** Compare the avatar beside its complete original artwork at a consistent camera angle. Check that masks, eyes, hair/fur, clothes, headwear, wings/tails, weapons, and accessories are visible and not clipping. Do not project a 2D background into 3D geometry.
7. **Runtime QA.** Test local and remote peers, avatar spawn/despawn, shared texture disposal, service-worker refresh, low-quality/mobile caps, and a session with several distinct NFTs. Record frame-time and memory observations rather than relying on source checks.
8. **Release gate.** Require reviewer sign-off on rights, metadata mapping, visuals, performance, and fallback behavior before an asset or collection is enabled.

## Acceptance checklist

- [ ] Collection identity is checked against authoritative XRPL data; client-provided collection names are never an ownership allowlist.
- [ ] Original raw traits and artwork reference remain recoverable.
- [ ] The full NFT artwork is prominent, framed, and contain-fit without cropping.
- [ ] Distinctive hairstyle, facial hair, markings, horn/antler, and pattern traits render as visible geometry.
- [ ] Unknown or malformed traits safely fall back without breaking the avatar.
- [ ] Every asset has provenance, SHA-256, rights status, license, and attribution.
- [ ] Model scale, rig, skeleton, dependencies, materials, and performance are measured.
- [ ] Representative common/rare/edge-case samples pass desktop and mobile review.
- [ ] A failed or missing custom asset falls back to the existing procedural avatar and full-art panel.
- [ ] Reviewer records the tested commit, sample references, issues, and approval.

## Current limits

This step creates the manifests, intake rules, automated structural validation, a larger artwork-first identity tabard, and metadata-driven hairstyle/marking/pattern/horn geometry. It does **not** fetch collection images, inspect live holder NFTs, add third-party models, or claim exact 3D visual parity. Live collection sampling, runtime visual QA, and mobile profiling remain explicit next validation tasks. Commercial XRP invoicing and public self-service onboarding remain outside this client-side asset pipeline.


## Collection-specific procedural reconstruction (current implementation)

The avatar builder now resolves a dedicated reconstruction blueprint per supported collection before assembling its Three.js meshes:

- **RACC:** anthropomorphic raccoon anatomy, broader rounded torso, raccoon skull/mask/muzzle, ringed tail, and a slightly more compact limb silhouette.
- **Firekeepers:** taller, layered robe silhouette with a tapered robe hem, ember mantle, cowl, and front sigil. Ember identity remains visible when trait metadata is sparse.
- **589 Protocol:** broader humanoid shoulders, streetwear-oriented silhouette, paired technical straps, and a BURN insignia/emblem.
- **Unmapped collections:** safe generic humanoid blueprint; original artwork remains the identity source.

The reconstruction blueprint is attached to avatar user data for inspection and future collection-specific rig/asset QA. It records the current mode as `procedural-collection-specific` and deliberately does not claim exact 1:1 reconstruction. Typed traits continue to override relevant visual details where available. These authored procedural meshes are a first reconstruction pass; representative sample review and browser/WebGL visual validation are still required before judging likeness or performance.
