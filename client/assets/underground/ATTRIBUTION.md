# The Undercroft assets

Used by `client/js/underground-gate.js` (city entrance) and `client/js/underground-hub.js` (Ember Crossroads hub). Everything not listed here is original to Burn City (procedural geometry, canvas textures, Web Audio).

## Models (`models/`), Sketchfab, CC BY 4.0

Changes for every model: merged into one mesh, re-centred and scaled in game, textures resized to 512 px and re-encoded as WebP, quantized with gltf-transform. Colours of the crystal and skull are tinted in game.

| File | Source | Author | License |
|---|---|---|---|
| `skullpile.glb` | ["Pile of Skulls"](https://sketchfab.com/3d-models/pile-of-skulls-11d46d32494c44218a55192adc067e57) | [Abimael Gonzalez](https://sketchfab.com/abimaelgonzalez) | [CC BY 4.0](http://creativecommons.org/licenses/by/4.0/) |
| `skull-lo.glb` | ["Forgotten Skull"](https://sketchfab.com/3d-models/forgotten-skull-a3d96696c1c140429dc2499d731be479) | [Nick Scott](https://sketchfab.com/Nickjjscott) | [CC BY 4.0](http://creativecommons.org/licenses/by/4.0/) |
| `torch.glb` | ["Medieval Wall Torch"](https://sketchfab.com/3d-models/medieval-wall-torch-77db436da2844cbfb4dde0bb9b396835) | [Kigha](https://sketchfab.com/Kigha) | [CC BY 4.0](http://creativecommons.org/licenses/by/4.0/) |
| `brazier.glb` | ["Medieval Brazier"](https://sketchfab.com/3d-models/medieval-brazier-cff29e533e3a4298a5d112cf7bb2558c) | [Sky_Hunter](https://sketchfab.com/Sky_Hunter) | [CC BY 4.0](http://creativecommons.org/licenses/by/4.0/) |
| `crystal.glb` | ["Ice Cluster (free)"](https://sketchfab.com/3d-models/ice-cluster-free-4d2271f8bf7f400e9a5c8f10812a32de) | [chrismartin1337](https://sketchfab.com/chrismartin1337) | [CC BY 4.0](http://creativecommons.org/licenses/by/4.0/) |
| `candle.glb` | ["Candle Holder"](https://sketchfab.com/3d-models/candle-holder-38c0f8b4df1b41e092e8cdc623b3b6ff) | [John Machine](https://sketchfab.com/JohnMachinehere) | [CC BY 4.0](http://creativecommons.org/licenses/by/4.0/) |

`skull-lo.glb` was simplified from 1,714 to 790 triangles and its texture resized to 256 px.

## Textures (`tex/`), Poly Haven, CC0 1.0

Diffuse maps resized to 1024 px (plus a 512 px copy for low graphics), normal maps (OpenGL) to 512 px, all re-encoded as WebP.

| Files | Source |
|---|---|
| `medieval_blocks_02_*.webp` | [Medieval Blocks 02](https://polyhaven.com/a/medieval_blocks_02) (CC0) |
| `white_sandstone_blocks_02_*.webp` | [White Sandstone Blocks 02](https://polyhaven.com/a/white_sandstone_blocks_02) (CC0) |
| `monastery_stone_floor_*.webp` | [Monastery Stone Floor](https://polyhaven.com/a/monastery_stone_floor) (CC0) |
| `rock_wall_08_*.webp` | [Rock Wall 08](https://polyhaven.com/a/rock_wall_08) (CC0) |

## Loading art

`veil.webp` is an original image generated for Burn City for this loading screen.

## Not used

The reference model the owner shared ("Paris catacombs - The Crossroad of Death (2)", CC BY-NC-SA) was used only as a mood reference and is not shipped or derived from.
