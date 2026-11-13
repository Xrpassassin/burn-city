# Egor zombie variant

Add David Glynch's [Zombie (Egor)](https://sketchfab.com/3d-models/zombie-6ff73b06cf63405d9557720c78cf5e0c) as an additional close-range visual variant of the standard Arena Zombies shambler. Keep the current human, hazmat, thin, and special zombie models in their existing roles. Egor shares the standard shambler's movement, hitbox, AI, damage, and wave rules.

## Source and distribution

- The supplied `zombie.zip` passed its ZIP integrity check and imported in Blender 4.3.2. SHA-256: `376438ed22c37a510da54765b17b826802f97fc9d00e313646e7acf37147e0a0`.
- The source is glTF 2.0 with five meshes totaling 109,396 triangles, a 66-joint skeleton, five 2048×2048 texture maps, and one approximately 11.67-second clip named `Armature|mixamo.com|Layer0`. The clip's action and suitability for gameplay remain to be reviewed.
- The archive and listing identify [Sketchfab Free Standard](https://sketchfab.com/licenses). Section 2.2(b) restricts distributing an asset in a way that lets third parties extract or access it as a standalone file. Burn City's public repository and existing browser GLB loader expose downloadable model files. Keep the archive and converted assets out of that delivery path unless the artist grants permission covering those uses or provides a release under terms that allow them. Credit David Glynch and record the distribution terms and modifications in the Zombies credits when the model ships.

## Integration after distribution rights are confirmed

- Review the supplied clip and determine whether it contains reusable action segments. Normalize scale, floor contact, forward axis, and root motion. Reuse or retarget compatible idle, walk, and attack clips where the source lacks them. Keep world movement controlled by the existing zombie simulation.
- Create a smaller GLB with baked surface detail and right-sized textures. Use [zombie-sketchfab-cast.mjs](../client/arena/zombie-sketchfab-cast.mjs) for the visual definition and [zombie-model-pilot.mjs](../client/arena/zombie-model-pilot.mjs) for loading and clip validation. Select Egor deterministically for a subset of ordinary shamblers by spawn ID, leaving the established human model as a fallback. Preserve the existing near-model cap and distant horde path.
- Check the imported rig and clips in Blender and in the browser. Verify idle, walking, attack timing, ground contact, and reactions on both Arena maps. Compare desktop and mobile frame time during a mixed horde and test fallback with the Egor asset unavailable.
