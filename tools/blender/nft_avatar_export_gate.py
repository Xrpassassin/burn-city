"""Fail-closed NFT base export gate for Blender authoring scenes.

Usage: blender -b rigged.blend --python tools/blender/nft_avatar_export_gate.py -- racc output.glb
Only structurally complete, explicitly approved assets may use this runtime export.
Blockouts should use the separate review exporters.
"""
import json
import os
import sys
import bpy
from nft_avatar_collection_contract import audit_blender_scene, contract_for

def validate_runtime_export(key):
    contract_for(key)
    audit=audit_blender_scene(key)
    rig=bpy.data.objects.get("BURN_"+key+"_Rig")
    required_meshes=contract_for(key).required_meshes
    approved=bool(rig and rig.get("visual_review_approved") is True
                  and rig.get("rig_review_approved") is True
                  and rig.get("performance_review_approved") is True)
    unapproved=[name for name in required_meshes
                if bpy.data.objects.get(name) is None
                or bpy.data.objects[name].get("runtime_approved") is not True]
    audit["missingMeshApprovals"]=unapproved
    audit["reviewApprovalsPresent"]=approved
    audit["exportAllowed"]=bool(audit["structurallyComplete"]
                                and approved and not unapproved)
    return audit

def main():
    args=sys.argv[sys.argv.index("--")+1:] if "--" in sys.argv else []
    if len(args)!=2:
        raise SystemExit("Usage: blender -b scene.blend --python nft_avatar_export_gate.py -- collection output.glb")
    key,output=args
    report=validate_runtime_export(key)
    print(json.dumps(report,indent=2,sort_keys=True))
    if not report["exportAllowed"]:
        raise SystemExit("Runtime export blocked: missing requirements or review approvals")
    output=os.path.abspath(output)
    os.makedirs(os.path.dirname(output),exist_ok=True)
    # Export only scene-visible authored assets, not hidden backups.
    bpy.ops.export_scene.gltf(filepath=output,export_format="GLB",
                              use_visible=True,export_apply=True)
    if not os.path.isfile(output) or os.path.getsize(output)<100:
        raise RuntimeError("Runtime GLB export failed")
    print("Runtime export created:",output)

if __name__=="__main__":
    main()
