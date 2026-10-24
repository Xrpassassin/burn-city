# NFT avatar open-source asset workflow

BURN City currently builds collection-specific avatars procedurally with Three.js. Keep that as the resilient fallback, but prefer reviewed, authored GLB/glTF assets for collection signatures where geometry matters: masks, tails, robes, halos, weapons, and distinctive silhouettes.

## Recommended open-source tools

- **Three.js GLTFLoader** — the runtime loader for approved glTF 2.0 assets. Use GLB for self-contained runtime delivery when practical. Official guide: https://threejs.org/docs/pages/GLTFLoader.html
- **glTF Transform (@gltf-transform/cli)** — MIT-licensed toolchain for inspecting and optimizing GLB/glTF files, pruning unused data, resizing textures, and compressing geometry. Project and license: https://gltf-transform.dev/ and https://github.com/donmccurdy/glTF-Transform
- **Blender** — open-source authoring tool for repairing meshes, creating collection-specific variants, rigging, and exporting glTF. Blender's application license is separate from the license of every model or texture created/imported with it.\n- **Ara 3D Gen (`olatunde85/3d-gen`) — candidate offline character-authoring pipeline, not a runtime dependency.** Its project describes an MIT-licensed generator built around CC0 MakeHuman data, with body/face morphs, hair, facial hair, clothing, rigging, animation, and GLB export. This could accelerate human-shaped 589 Protocol variants and survivor/NPC prototyping. Before adopting it, pin a reviewed commit, audit its asset setup script and bundled/downloaded assets, benchmark GLB size and mobile performance, and preserve BURN City's trait-driven collection signature geometry. Project: https://github.com/olatunde85/3d-gen.\n- **SOMA-X** — a promising Apache-2.0 parametric-body research/engineering option for a later high-fidelity rigged-human pipeline. Treat it as a separate offline evaluation because its setup and supported backends are more involved than the current procedural Three.js renderer. Project: https://github.com/NVlabs/SOMA-X. Do not assume optional third-party body-model files inherit the project's license.

## Suggested intake workflow

1. Record the source URL, author, license, attribution, redistribution permission, SHA-256, model format, units, polygon count, and rig/animation compatibility in the collection manifest.
2. Complete the human rights/license review before checking any third-party model or texture into the game. A tool being open source does **not** make its sample assets open for reuse.
3. Keep an untouched source copy. Optimize a separate build copy with glTF Transform only after a real model is approved. Example CLI invocation:
   `npx @gltf-transform/cli optimize source.glb optimized.glb`
4. Inspect the optimized output in a glTF viewer and in BURN City's Three.js scene. Compare materials, silhouette, scale, skeleton, and animation before replacing the procedural fallback.
5. Test on a lower-powered mobile device. Compression settings must not silently remove textures, alter silhouette-critical geometry, or break animation.
6. Store the reviewed asset record in `assets/nft-avatars/collections/` and run `npm run -s test:nft-avatar`.

## Integration decision

Do not add a runtime dependency or bulk-download a generic model pack before an approved asset exists. The existing Three.js renderer already supplies the procedural path; glTF Transform is an optional authoring/build tool, not a required runtime library. This keeps the game lean while making the path to high-fidelity collection models repeatable and commercially auditable.
