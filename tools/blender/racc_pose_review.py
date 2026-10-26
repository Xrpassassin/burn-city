"""Generate reproducible RACC armature pose-review Blender files.

Usage: blender -b rigged-racc.blend --python tools/blender/racc_pose_review.py -- output-dir
Creates neutral, stride and crouch .blend scenes for manual deformation inspection.
Does not certify animation quality or export a runtime avatar.
"""
import bpy
import json
import os
import sys
from math import radians

POSES={
    "neutral":{},
    "stride":{
        "L_thigh":(radians(22),0,0),"R_thigh":(radians(-22),0,0),
        "L_shin":(radians(-12),0,0),"R_shin":(radians(28),0,0),
        "L_upper_arm":(radians(-18),0,0),"R_upper_arm":(radians(18),0,0),
        "tail_01":(0,radians(10),0),"tail_02":(0,radians(-8),0),
    },
    "crouch":{
        "pelvis":(radians(12),0,0),
        "L_thigh":(radians(45),0,0),"R_thigh":(radians(45),0,0),
        "L_shin":(radians(-55),0,0),"R_shin":(radians(-55),0,0),
        "spine":(radians(10),0,0),"tail_01":(0,radians(-12),0),
    },
}

def main():
    args=sys.argv[sys.argv.index("--")+1:] if "--" in sys.argv else []
    if len(args)!=1:
        raise SystemExit("Usage: blender -b rigged.blend --python racc_pose_review.py -- output-dir")
    out=os.path.abspath(args[0])
    os.makedirs(out,exist_ok=True)
    rig=bpy.data.objects.get("BURN_racc_Rig")
    if rig is None or rig.type!="ARMATURE":
        raise RuntimeError("Missing BURN_racc_Rig armature")
    body=bpy.data.objects.get("RACC_ContinuousBody_Blockout")
    if body is None or not any(m.type=="ARMATURE" and m.object==rig for m in body.modifiers):
        raise RuntimeError("Fused RACC body is not bound to rig")
    report={"collection":"racc","runtimeApproved":False,"poses":[]}
    for name,rotations in POSES.items():
        for bone in rig.pose.bones:
            bone.rotation_mode="XYZ"
            bone.rotation_euler=(0,0,0)
            bone.location=(0,0,0)
            bone.scale=(1,1,1)
        for bone_name,angles in rotations.items():
            bone=rig.pose.bones.get(bone_name)
            if bone is None:
                raise RuntimeError("Missing pose bone: "+bone_name)
            bone.rotation_euler=angles
        bpy.context.view_layer.update()
        path=os.path.join(out,"racc-pose-"+name+".blend")
        bpy.ops.wm.save_as_mainfile(filepath=path)
        report["poses"].append({"name":name,"blend":path,"boneRotations":list(rotations)})
    with open(os.path.join(out,"racc-pose-review.json"),"w",encoding="utf-8") as f:
        json.dump(report,f,indent=2)
    print(json.dumps(report,indent=2))

if __name__=="__main__":
    main()
