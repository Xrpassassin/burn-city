# Zombies environment props — attribution

Selected, compressed low-poly props used as cosmetic dressing on the original Zombies maps. They do not change server collision, pathfinding, buys, or spawns.

All models below are by **Kenney** (https://kenney.nl), released under [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/). Attribution is not required; it is included with thanks.

| File | Upstream pack | Original name | Official pages |
| --- | --- | --- | --- |
| kenney-sedan.glb, kenney-taxi.glb, kenney-van.glb, kenney-debris-tire.glb, kenney-debris-bumper.glb, kenney-debris-door.glb | Car Kit 3.1 | sedan, taxi, van, debris-tire, debris-bumper, debris-door | https://kenney.nl/assets/car-kit · https://opengameart.org/content/car-kit |
| kenney-wood-fence.glb, kenney-wood-fence-fortified.glb, kenney-barrel.glb, kenney-crate.glb, kenney-crate-large.glb | Survival Kit 2.0 | fence, fence-fortified, barrel, box, box-large | https://kenney.nl/assets/survival-kit · https://opengameart.org/content/survival-kit |
| kenney-grave-fence-damaged.glb, kenney-iron-fence-damaged.glb, kenney-rubble.glb, kenney-lightpost.glb | Graveyard Kit 5.0 | fence-damaged, iron-fence-damaged, debris, lightpost-single | https://kenney.nl/assets/graveyard-kit · https://opengameart.org/content/graveyard-kit |
| kenney-barrier.glb, kenney-cone.glb, kenney-work-fence.glb, kenney-work-light.glb, kenney-dumpster.glb | City Kit (Roads) 2.2 | construction-barrier, construction-cone, construction-fence, construction-light, dumpster | https://kenney.nl/assets/city-kit-roads · https://opengameart.org/content/city-kit-roads |

## Modifications by BURN City

- Selected only the models listed above from each official zip (not the full packs).
- Embedded each pack's colormap into the GLB so the file is self-contained.
- Compressed textures to WebP (max 256px) and welded/pruned meshes with [gltf-transform](https://github.com/donmccurdy/glTF-Transform) (MIT).
- Runtime: instanced MeshBasic (unlit) draws, rust/dirt tints, slight wrecked-car tilt, and a low-graphics density cap.

The original Kenney license text for each pack is copied next to these files.
