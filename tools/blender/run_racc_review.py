"""Run the RACC fusion + four-view visual QA pipeline from a generated GLB.

Example:
  python3 tools/blender/run_racc_review.py --input build/racc.glb --out build/racc-review
Requires Blender installed and accessible on PATH. Does not merge or deploy.
"""
import argparse
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys

def run(command):
    print("+", " ".join(map(str,command)), flush=True)
    subprocess.run(command,check=True)

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("--input",required=True,help="Existing RACC GLB blockout")
    parser.add_argument("--out",required=True,help="Directory for review artifacts")
    parser.add_argument("--blender",default="blender")
    args=parser.parse_args()
    blender=shutil.which(args.blender)
    if blender is None:
        parser.error("Blender executable not found; install Blender or pass --blender PATH")
    source=Path(args.input).resolve()
    if not source.is_file() or source.suffix.lower()!=".glb":
        parser.error("--input must point to an existing .glb file")
    scripts=Path(__file__).resolve().parent
    run([sys.executable,str(scripts/"racc_glb_preflight.py"),str(source)])
    out=Path(args.out).resolve()
    out.mkdir(parents=True,exist_ok=True)
    scene=out/"racc-fused.blend"
    review=out/"racc-fused-review.glb"
    preview=out/"racc-preview.png"
    run([blender,"-b","--python",str(scripts/"nft_avatar_racc_body_fusion.py"),
         "--",str(source),str(scene)])
    if not review.is_file() or review.stat().st_size<100:
        raise RuntimeError("Fusion did not produce review GLB")
    run([blender,"-b","--python",str(scripts/"nft_avatar_base_preview.py"),
         "--",str(review),str(preview)])
    qa=out/"racc-fused-fusion-qa.json"
    view_qa=out/"racc-preview-qa.json"
    for file in (qa,view_qa):
        if not file.is_file():
            raise RuntimeError("Missing QA manifest: "+str(file))
    fusion=json.loads(qa.read_text())
    views=json.loads(view_qa.read_text())
    if fusion.get("collection")!="racc":
        raise RuntimeError("Unexpected collection in fusion manifest")
    if len(views.get("views",{}))!=4:
        raise RuntimeError("Expected four preview renders")
    for file in views["views"].values():
        if not Path(file).is_file():
            raise RuntimeError("Missing rendered preview: "+str(file))
    result={
        "collection":"racc",
        "stage":"review-only",
        "runtimeApproved":False,
        "continuousBodyPass":fusion.get("continuousBodyPass",False),
        "nonManifoldEdges":fusion.get("nonManifoldEdges"),
        "degenerateFaces":fusion.get("degenerateFaces"),
        "views":views["views"],
        "nextGate":"Human visual review, retopology, skinning and game tests"
    }
    (out/"racc-review-summary.json").write_text(json.dumps(result,indent=2)+"\n")
    print(json.dumps(result,indent=2))
    if not result["continuousBodyPass"]:
        print("WARNING: Body is disconnected; requires geometry repair.",file=sys.stderr)

if __name__=="__main__":
    main()
