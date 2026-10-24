# NFT avatar collection recipes

The executable recipe registry is `client/js/nft-avatar-collection-recipes.js`. The procedural reconstruction resolver consumes these recipes directly, so QA criteria, shape proportions, signature silhouette tags, trait-slot hints and mobile budgets live in one auditable place.

## Supported recipes

- **RACC** — anthropomorphic raccoon proportions, eye-mask/muzzle/ringed-tail identity, humanoid-plus-tail rig intent.
- **Firekeepers** — layered-robed proportions, cowl/ember mantle/sigil identity, robe-oriented rig intent.
- **589 Protocol** — streetwear/techwear proportions, BURN insignia, chain and tech-gear identity.
- **Generic** — explicit safe fallback for unsupported collection keys.

## Contract

Each recipe contains:
- collection key, archetype and intended rig profile;
- positive body/head proportions and stable silhouette tags;
- human visual acceptance criteria that must be checked against the original NFT;
- collection trait-name to canonical render-slot hints;
- material-language hints and target triangle, texture-byte and draw-call budgets;
- a mandatory original-artwork review gate.

These budgets are target guardrails, not measurements of an existing model. They do not certify that a procedural character is within budget. Runtime manifests still require separate asset rights approval, output digest, visual QA and device performance review.

## Commands

Run `node client/js/nft-avatar-collection-recipes.test.mjs` to validate recipe contracts and prove the reconstruction layer uses the same recipe source. Existing avatar regression coverage remains part of `npm run test:nft-avatar`.

No final 3D asset is fabricated by this registry. It makes collection-specific model production deterministic and gives Hark a concrete contract for authored/AI-generated meshes to satisfy.
