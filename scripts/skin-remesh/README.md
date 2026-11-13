# Character mesh rebuild (skin-remesh)

Box-only asset tools (not run in CI) that replace the mesh inside an already-rigged glTF export while keeping its rig, skin,
clips, bone names, materials and textures exactly as they are.

Why: Blender's Decimate (collapse) at 1-2% of a Sketchfab model welds UV seams, so the texture smears across the face and
clothes (the Ember Bar bartender's and Blackbeard's faces, the Gas Mask Guy's coat and mask) and the thin scan surfaces break
into holes at distance LODs. meshoptimizer keeps attribute seams and borders.

1. `prep_source.py` (Blender) joins the source into one static mesh, welds the 65k-vertex export chunks, keeps UV0 only and
   optionally splits it into head and body at a height fraction, so faces get a bigger triangle budget.
2. `gltfpack -si <ratio> -se 0.5 [-slb]` simplifies each part (`-slb` locks the shared neck border so it stays closed).
3. `reskin.py` aligns the new mesh to the old one (yaw search + bbox fit + trimmed ICP), transfers skin weights from the k
   nearest old vertices that face the same way, rebuilds smooth normals across UV seams and writes a compact .gltf/.bin.
   Options: `--drop-head` (first-person body), `--weights-from`, `--smooth-hips=N` (coat hems in Sit/Ride),
   `--removed-from` (keep hand-cut parts out, e.g. Blackbeard's cutlass), `--cut-box` (drop a held prop),
   `--cut-leg-webs` (drop faces bridging the two legs below 0.32 H), `--arms-out` (swing an arms-out source's arms down onto
   the template rig first). Extra buffers (the citizens' `<id>.walk.bin` Walk clip) are kept and copied next to the output.

`build.sh` runs the whole thing for the bar characters, the Gas Mask Guy player and the 10 City citizens. Sources and licences: `client/city-credits.html`
(all CC BY 4.0). Requires Blender 4.2, Node (npx gltfpack) and Python with numpy, scipy and pillow.
