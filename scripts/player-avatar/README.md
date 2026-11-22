# Gas Mask Guy player avatar

| Field | Value |
| --- | --- |
| Model | Gas Mask Guy |
| Creator | [The Creator](https://sketchfab.com/the_cre4tor) |
| Source | [Sketchfab](https://sketchfab.com/3d-models/gas-mask-guy-5db403f2df174f7f9abbe967f02ab3cd) |
| Sketchfab UID | `5db403f2df174f7f9abbe967f02ab3cd` |
| License | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |

The listing reports 1,976,719 triangles and 4K textures, with no rig or clips. Download the original through the authorized Sketchfab connection and stage it outside the repo. `build_player.py` (then `tighten_player.py`) retopologizes the scan, bakes a 1024 / 512 base-color texture, binds a simple humanoid rig, and authors in-house Idle, Walk, Run, Ride, Sit and Jump clips. The mask and silhouette are preserved. Clones reuse one geometry and texture set.

## Mesh rebuild (Nov 2026)

The first build collapsed the scan with Blender's Decimate, which smeared the texture across UV seams (blotchy, faceted coat and mask) and shredded the distant LOD into holes. The meshes are now rebuilt by `scripts/skin-remesh/build.sh`: meshoptimizer (gltfpack) simplifies the original scan with its UV seams intact, `reskin.py` swaps that mesh into these exports and transfers the skin weights, so the rig, clips, materials and textures are unchanged. Hip and thigh weights are smoothed so the coat hem bends in Sit and Ride instead of tearing.

## Exports

- `client/assets/players/gas-mask-guy.gltf` is 1.8 m tall, Y-up, feet at the origin, facing −Z (the walker's forward) in the exported scene since the skin bind fix (`fix_bind.mjs`, Nov 2026); the shared loader applies only the mode's yaw. **9,000 triangles**, one material, 1024 px webp (512 px on phones via `gas-mask-guy-tex-512/`). Clips: `Idle`, `Walk`, `Run`, `Sprint`, `Air`, `Ride`, `Sit`, `Jump`. Locomotion is in place.
- `client/assets/players/gas-mask-guy-lod.gltf` is the same rig and clips at **3,848 triangles**, used for other players at a distance (and lite/phone quality).
- `client/assets/players/gas-mask-guy-body.gltf` is the first-person body (**7,757 triangles**) with the head and mask stripped, for Zombies, Eternal Grind and Pyretheum. Sleeves on the existing weapon view model are unchanged.
- `MODEL_AVAILABLE` in `client/js/default-player-avatar.mjs` is on for all three exports. The city service worker version is bumped when the files change. Attribution, including the changes above, is in `client/city-credits.html`.
- NPCs use their own models. The shared player variant is cosmetic. Keep each mode's player root, movement, collision, equipment, camera and character progression.
- NFT holders still get this default walker tinted by collection, plus a floating NFT art card, in every game except Eternal Grind.

## In-game checks

Verify guest and wallet players get the same default in City, Estates, and Homefront. Check City activity modes that reuse its avatar, including fishing, skating and the Wilds. Test Homefront both at the refuge and in the overworld. Check remote Zombies players, first-person body clipping, downed poses, and clearing players when changing maps. Check the seated Light Cycles rider, Blacktide helm and walking avatars, Eternal Grind first-person combat, and Pyretheum seating. Confirm the previous visuals remain usable with a missing or invalid export.

## Skin bind fix and gait clips (Nov 2026)

`fix_bind.mjs` repairs the exported skin bind (the rig root's half turn was missing from the inverse bind matrices, so every joint pivoted on the far side of the body) and turns the legacy Idle/Jump/Sit/Ride motions to match; `author_gait.mjs` then authors Walk/Run/Sprint/Air on the corrected rig. Both are animation/bind only: meshes, skin weights, joints, rest pose and textures are unchanged. All motion is in-house procedural (no third-party animation data). See HANDOFF.md, "Gas Mask Guy locomotion".

## Limb pivots and skin weights (Nov 2026)

Run order on the assets: `fix_bind.mjs` -> `fix_limb_joints.mjs` -> `fix_weights.mjs` -> `author_gait.mjs` (each idempotent). `fix_limb_joints.mjs` moves the hip, knee, ankle, shoulder and elbow pivots to the middle of their limbs (measured on the full mesh, one rig for all three files), recomputes their inverse binds and retargets the legacy Idle/Jump/Sit/Ride limb channels by IK so boots and gloves stay put; Sit/Ride legs become a real seat (boots on the floor). `fix_weights.mjs` derives clean weights from vertex positions and the rest joints only: the air tanks are rigid on the chest, arms/legs blend smoothly at shoulders, elbows, wrists, hips, knees and ankles, the coat skirt hangs from the hips, no `neutral_bone`, at most four influences. Positions, normals, UVs, indices and textures are unchanged. `client/js/default-player-avatar-deform.test.mjs` checks the result. Never rerun `build_player.py` or the reskin: they regenerate the mesh, weights and rest pose.
