# Connected-holder NFT base rig production

## Authoring sequence
1. On an authorized server volume, export token-only verified holder intake with `scripts/nft-holder-avatar-export.mjs`.
2. Run `node scripts/nft-holder-trait-priority.mjs avatar-queue.json > trait-priority.json`.
3. Run `node scripts/nft-holder-trait-production.mjs trait-priority.json > trait-production.json`.
4. Author a collection base mesh in Blender. The generator in `tools/blender/nft_avatar_generator.py` can provide a **procedural blockout reference**, not a likeness-approved mesh.
5. Open the authored base .blend and run `blender -b base.blend --python tools/blender/nft_avatar_base_rig.py -- racc racc-rigged.blend` (substitute `fk` or `589`).
6. Weight paint the authored base to the generated armature; verify deformation at elbows, knees, shoulders, neck and collection-specific tail/robe.
7. Author reusable trait meshes **against the exact token artwork**, attach them to the corresponding bone or anchor, and test idle/walk/run animation.
8. Export GLB candidates, inspect front/side/rear, measure draw calls/triangles on mobile, verify rights and SHA-256, and explicitly approve before publishing.

## Important distinctions
- A generated armature is not a skinned or animation-tested model.
- A procedural blockout is not a faithful NFT reconstruction.
- Holder inventory is a snapshot of verified tokens, not proof of perpetual ownership; recheck authorization before any wallet-gated use.
- Never publish wallet addresses or private NFT inventory exports to the repository.
- The armature's trait bone names are authoring contracts; the attachment-rig module provides static GLB markers. A runtime adapter must resolve the final bone/marker hierarchy after skinning.
- No live connected-holder inventory has been accessed in this development session.
