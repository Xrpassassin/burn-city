#!/bin/bash
# Rebuild the Ember Bar characters and the Gas Mask Guy player meshes with meshoptimizer (box only, NOT in CI).
# Needs: Blender 4.2 ($BLENDER), npx gltfpack (meshoptimizer), python3 with numpy + scipy + pillow ($PY).
# Sources (CC BY 4.0 Sketchfab downloads) are staged outside the repo: $BAR_SRC/{pirate-prep,blackbeard-prep,pirate,blackbeard}
# and $PLAYER_SRC/gas-mask-guy. The current rigged exports are the templates: rig, skin, clips and materials stay as they are,
# only the mesh is replaced (weights transferred from the old mesh). $PRE_CUT holds Blackbeard's exports from before #633 cut
# his cutlass out of the index buffer, so the same triangles stay out.
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd); ROOT=$(cd "$HERE/../.." && pwd); A="$ROOT/client/assets"
BLENDER=${BLENDER:-blender}; PY=${PY:-python3}; GP=${GLTFPACK:-npx gltfpack}
BAR_SRC=${BAR_SRC:-/workspace/bar-src}; PLAYER_SRC=${PLAYER_SRC:-/workspace/player-src}; PRE_CUT=${PRE_CUT:-/workspace/bar-out}
W=${WORK:-/tmp/skin-remesh}; mkdir -p "$W"; cd "$W"
tris() { node -e "const b=require('fs').readFileSync('$1');const j=JSON.parse(b.slice(20,20+b.readUInt32LE(12)));const p=j.meshes[0].primitives[0];console.log(j.accessors[p.indices].count/3)"; }
# simplify <in.glb> <out.glb> <target tris> [extra gltfpack flags]: keeps UV seams; -se 0.5 (1.0 makes this build emit an empty mesh)
simp() { local n; n=$(tris "$1"); $GP -i "$1" -o "$2" -si "$(python3 -c "print(min(1, $3 / $n))")" -se 0.5 -noq -kv ${4:-} >/dev/null; echo "$2: $(tris "$2") tris"; }
prep() { "$BLENDER" -b --factory-startup -P "$HERE/prep_source.py" -- "$1" "$2" ${3:-} | grep PREP; }

# ---- pirate bartender (RYStudio): head simplified separately with a bigger budget, border locked so the neck stays closed
prep "$BAR_SRC/pirate-prep/scene.gltf" pirate-hi.glb 0.84
simp pirate-hi-head.glb ph-6000.glb 6000 -slb; simp pirate-hi-body.glb pb-6000.glb 6000 -slb
simp pirate-hi-head.glb ph-2400.glb 2400 -slb; simp pirate-hi-body.glb pb-2400.glb 2400 -slb
$PY "$HERE/reskin.py" "$A/bar/pirate.gltf" ph-6000.glb,pb-6000.glb "$A/bar/pirate.gltf"
$PY "$HERE/reskin.py" "$A/bar/pirate-lo.gltf" ph-2400.glb,pb-2400.glb "$A/bar/pirate-lo.gltf"
# ---- Blackbeard (FrandProductions)
BOX=-0.31,-0.17,0.6,0.84,0.285,0.5   # the short blade left in his right hand
prep "$BAR_SRC/blackbeard-prep/scene.gltf" bb-hi.glb 0.84
simp bb-hi-head.glb bh-4000.glb 4000 -slb; simp bb-hi-body.glb bb-5000.glb 5000 -slb
simp bb-hi-head.glb bh-2000.glb 2000 -slb; simp bb-hi-body.glb bb-2500.glb 2500 -slb
$PY "$HERE/reskin.py" "$A/bar/blackbeard.gltf" bh-4000.glb,bb-5000.glb "$A/bar/blackbeard.gltf" --removed-from="$PRE_CUT/blackbeard.gltf" --cut-box=$BOX
$PY "$HERE/reskin.py" "$A/bar/blackbeard-lo.gltf" bh-2000.glb,bb-2500.glb "$A/bar/blackbeard-lo.gltf" --removed-from="$PRE_CUT-lo/blackbeard.gltf" --cut-box=$BOX
# ---- Gas Mask Guy (the_cre4tor): whole mesh (keeps the hoses), two passes because one 2M -> 9k pass comes back empty
prep "$PLAYER_SRC/gas-mask-guy/scene.gltf" gmg-hi.glb
simp gmg-hi.glb gmg-20k.glb 19711; simp gmg-20k.glb gmg-9000.glb 9000; simp gmg-9000.glb gmg-far.glb 2600
P="$A/players"
$PY "$HERE/reskin.py" "$P/gas-mask-guy-body.gltf" gmg-9000.glb "$P/gas-mask-guy-body.gltf" --drop-head --weights-from="$P/gas-mask-guy.gltf" --smooth-hips=12
$PY "$HERE/reskin.py" "$P/gas-mask-guy-lod.gltf" gmg-far.glb "$P/gas-mask-guy-lod.gltf" --smooth-hips=12
$PY "$HERE/reskin.py" "$P/gas-mask-guy.gltf" gmg-9000.glb "$P/gas-mask-guy.gltf" --smooth-hips=12
# ---- textures: bar faces get 2048 px on desktop and 1024 px on phones (the folder keeps its -tex-512 name for the URL swap)
$PY - "$BAR_SRC" "$A/bar" <<'PYX'
import sys
from PIL import Image
src, out = sys.argv[1:]
for m in ('pirate', 'blackbeard'):
    im = Image.open(f'{src}/{m}/textures/material_0_baseColor.jpeg').convert('RGB')
    im.resize((2048, 2048), Image.LANCZOS).save(f'{out}/{m}-tex/material_0_baseColor.webp', quality=82, method=6)
    im.resize((1024, 1024), Image.LANCZOS).save(f'{out}/{m}-tex-512/material_0_baseColor.webp', quality=85, method=6)
PYX
# ---- City citizens (10 CC BY scans in $NPC_SRC/<id>/scene.gltf): head 3500 + body 5500 tris, border locked. The Walk clip lives
# in <id>.walk.bin (second buffer, scripts/city-citizens/rebake_walk.py) and is carried over as-is; the far VAT LODs are not touched.
# --cut-leg-webs drops the thigh-to-thigh skirt/coat faces that tear when the legs stride; gothic-elegance was exported with its
# arms out, so --arms-out swings the new mesh's arms down onto the old rig before the weights are transferred.
NPC_SRC=${NPC_SRC:-/workspace/npc-src}; C="$A/citizens"
for id in casual-w blonde-black exec-navy trekker elegance-black-b gothic-elegance athletic-black casual-m-b keys-portrait inked-warrior; do
  prep "$NPC_SRC/$id/scene.gltf" "$id-hi.glb" 0.84
  simp "$id-hi-head.glb" "$id-h.glb" 3500 -slb; simp "$id-hi-body.glb" "$id-b.glb" 5500 -slb
  X=""; [ "$id" = gothic-elegance ] && X=--arms-out
  $PY "$HERE/reskin.py" "$C/$id.gltf" "$id-h.glb,$id-b.glb" "$C/$id.gltf" --cut-leg-webs $X
done
echo SKIN_REMESH_DONE
