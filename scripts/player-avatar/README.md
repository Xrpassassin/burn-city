# Gas Mask Guy player avatar

| Field | Value |
| --- | --- |
| Model | Gas Mask Guy |
| Creator | [The Creator](https://sketchfab.com/the_cre4tor) |
| Source | [Sketchfab](https://skfb.ly/pPZp9) |
| Sketchfab UID | `5db403f2df174f7f9abbe967f02ab3cd` |
| License | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |

Download the original through the authorized Sketchfab connection and stage it outside the repo. The listing reports about two million triangles. Inspect whether the archive has usable weights and animation. Retopologize or simplify the mesh, bake its surface detail, and bind it to a humanoid rig if needed. Preserve the mask and silhouette. Reuse a shared geometry and texture set across clones. Aim for under 8,000 triangles, two materials and 1K textures as first-pass targets, then profile a crowded City and a full Zombies lobby on mobile.

## Exports

- `client/assets/players/gas-mask-guy.gltf` is a 1.8 m tall, Y-up rig with the feet at the origin and the character facing −Z. Include named `Idle`, `Walk`, `Run`, and seated `Ride` clips. Keep locomotion clips in place and check the rider's hands and feet against the bike. Use external same-origin buffers and textures in paths relative to the glTF.
- `client/assets/players/gas-mask-guy-body.gltf` uses the same orientation and clips for first-person body views in Zombies, Eternal Grind and Pyretheum. Strip head and first-person-obstructing parts. Keep sleeves on the existing weapon view model where the game owns those meshes. Add `Sit` and `Jump` for the tower body if the rig supports them.
- Enable the corresponding entry in `MODEL_AVAILABLE` in `client/js/default-player-avatar.mjs` when committing its export. Bump the city service worker version for that change and publish attribution in `client/city-credits.html`, including actual changes made to the source.
- NPCs use their own models. The shared player variant is cosmetic. Keep each mode's player root, movement, collision, equipment, camera and character progression.

## In-game checks

Verify guest and wallet players get the same default in City, Estates, and Homefront. Check City activity modes that reuse its avatar, including fishing, skating and the Wilds. Test Homefront both at the refuge and in the overworld. Check remote Zombies players, first-person body clipping, downed poses, and clearing players when changing maps. Check the seated Light Cycles rider, Blacktide helm and walking avatars, Eternal Grind first-person combat, and Pyretheum seating. Confirm the previous visuals remain usable with a missing or invalid export. NFT player visuals are paused by the shared policy, with NFT ownership and saved selections retained.
