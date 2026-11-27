# Estates open-source props

Phone-light subset of official Kenney CC0 packs used for Estates yards, paths, fences, plants, rugs, lamps and extra interior furniture. Attribution is not required by CC0; it is included with thanks.

| Files | Pack | Official pages | License |
| --- | --- | --- | --- |
| `furniture/*.glb` | Furniture Pack / Furniture Kit 1.0 by Kenney (www.kenney.nl) | https://kenney.nl/assets/furniture-kit · https://opengameart.org/content/furniture-kit | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) — license text in `LICENSE-kenney-furniture-pack.txt` |
| `yard/*.glb` | Nature Kit 2.1 by Kenney (www.kenney.nl) | https://kenney.nl/assets/nature-kit · https://opengameart.org/content/nature-kit | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) — license text in `LICENSE-kenney-nature-kit.txt` |

Provenance:

- Furniture models were taken from the official OpenGameArt upload `kenney_furniturePack.zip` (same Kenney Furniture Kit, CC0). The official pack ships OBJ/FBX; selected meshes were converted to self-contained GLB with [obj2gltf](https://github.com/CesiumGS/obj2gltf) (Apache-2.0). Vertex colours come from the original MTL materials. No meshopt/quantize (the client has no MeshoptDecoder).
- Nature Kit models are official self-contained GLBs from the OpenGameArt Nature Kit 2.1 zip, copied without mesh changes.
- Only a small subset is bundled. Original filenames are mapped in this folder (for example `loungeSofa.obj` → `furniture/lounge-sofa.glb`, `fence_simple.glb` → `yard/fence-simple.glb`).
- At runtime the models are recentred, uniformly scaled to fit existing furnishings or lot setbacks, and instanced. Low graphics mode thins yard flowers and extra bushes. Box primitives remain as instant fallbacks if a file cannot load.

Existing Sketchfab CC BY sofas, beds, kitchens and large plants inside homes are credited separately in `client/city-credits.html` and `client/assets/estates-interiors/CREDITS.md`.

## Reviewed but not bundled
Kenney City Kit (Suburban) and Building Kit (CC0, kenney.nl) were reviewed for whole-house meshes. They are not shipped in this folder so Estates collision footprints and door positions stay compatible with the door-anchored Enter/Edit chip. Yard and furniture pieces above remain in use.

## Procedural listing signs
Unsold front-yard For Sale signs are authored in-engine (shared canvas texture, no prices). They are not Kenney meshes.

## Furniture quality tiers
Yard planting (bushes, flowers, pots and grass) scales with how many typoon upgrades a lot already has. Unsold lots keep the basic set. Hero furniture inside homes uses the existing CC BY Sketchfab collection credited in `client/assets/estates-interiors/CREDITS.md`, not additional Kenney hero meshes, so rooms stay visually consistent.
