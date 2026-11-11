# Zombie creature assets — original Arena Zombies

The following files are Creative Commons–licensed 3D characters used in the original BURN City **Zombies** mode, not Homefront. All are modifications / optimized exports from the cited reference game's public model archive. Attribution to the original creators must remain accessible in the game and with redistributed files.

| Bundled file | Original title and creator | License | Original work |
|---|---|---|---|
| `zombie-aiden.glb` | **Zombie (Rigged & Animated)**, **Aiden Studios** (`aidenstudios`) | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) | [Sketchfab model 1316888](https://sketchfab.com/3d-models/zombie-rigged-animated-131688807ad444609ed9b2ed572dc4aa) |
| `zombie-hazmat.glb` | **Zombie Hazmat**, **LxNazarov** | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) | [Sketchfab model 49b3b43](https://sketchfab.com/3d-models/zombie-hazmat-49b3b4307f6a4d2386fdb02354158d04) |
| `zombie-thin.glb` | **Thin Zombie (Awake Zombie)**, **Rosswet Mobile** | [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/) | [OpenGameArt](https://opengameart.org/content/thin-zombie-awake-zombie-asset) |

**Distribution and modifications:** Source GLBs are public, CC BY–credited, optimized exports hosted by [Dernière Nuit à Perpignan](https://walking.morgannriu.fr/) (see [its original 3D asset credits](https://walking.morgannriu.fr/assets/models/CREDITS.md)). That project's detailed author-supplied attribution states that the Sketchfab models were downloaded via Sketchfab's authenticated download API on September 28, 2026 and textures were converted to WebP quality 85 with glTF-Transform; the hazmat walk's root motion is stripped at runtime. `zombie-real-2.glb` was exported from the original Rosswet Mobile Blender model and its PBR material reworked. BURN City changes the filenames, scales models and remaps animations. Original source/author/license information is embedded in the Aiden and Hazmat GLB metadata and recorded in `sketchfab-verified-asset-manifest.json` with SHA-256 hashes.

**Animations:** Aiden includes Idle/Walk1/Attack1.001. Hazmat includes Zombie_Idle/Zombie_Walk_Root/Zombie_Skill (the published Mixamo-derived clip names are retained). Thin Zombie includes idle/walk/run/attack1_r/hurt/dead1 and other clips. The model selector keeps original enemy movement/combat authoritative; missing death/hit animations are replaced by BURN City's own visual toppling/flinch, never by changing damage or AI.

**Model bundling:** The vendoring script accepts only the exact named public files, checks binary glTF v2, skinned mesh, textures, clip names and (where embedded) source author/license metadata. If an asset is unavailable or fails verification, deployment of that changed asset must fail rather than silently substituting cartoon characters.

The original `zombie-ash.glb`, `zombie-frost.glb`, `zombie-rust.glb` and `quaternius-zombie.glb` remain in the repository for history and optional art review; none are used in the default Zombies mode after this integration.

## License reminder

Creative Commons Attribution permits commercial reuse and adaptations, **with proper credit, license links and indication of modifications**. This notice must stay visible to end users. No asset is claimed as original BURN City artwork. Third-party animations may carry additional provenance considerations: retain named creators and source pages and verify licensed usage of supplied animation data.
