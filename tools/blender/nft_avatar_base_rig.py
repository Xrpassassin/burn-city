"""Reusable Blender base-armature authoring pass for BURN City NFT avatars.

Usage: blender -b base.blend --python nft_avatar_base_rig.py -- racc output.blend
The input .blend must contain an authored base mesh; this adds an animation-ready
bone hierarchy and stable trait anchor bones. Skin weights and visual QA are NOT
automatically certified by this pass.
"""
import bpy
import sys
from mathutils import Vector

COLLECTIONS = {
    "racc": {"head": 1.75, "tail": True, "robe": False},
    "fk": {"head": 1.79, "tail": False, "robe": True},
    "589": {"head": 1.78, "tail": False, "robe": False},
}

def add_bone(bones, name, head, tail, parent=None, deform=True):
    bone = bones.new(name)
    bone.head, bone.tail = head, tail
    bone.use_deform = deform
    if parent:
        bone.parent = bones[parent]
    return bone

def create_base_armature(collection):
    if collection not in COLLECTIONS:
        raise ValueError("Unsupported collection: " + collection)
    profile = COLLECTIONS[collection]
    h = profile["head"]
    arm = bpy.data.armatures.new("BURN_" + collection + "_Armature")
    rig = bpy.data.objects.new("BURN_" + collection + "_Rig", arm)
    bpy.context.collection.objects.link(rig)
    bpy.ops.object.select_all(action="DESELECT")
    bpy.context.view_layer.objects.active = rig
    rig.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    b = arm.edit_bones
    add_bone(b,"root",(0,0,0),(0,0,.15),deform=False)
    add_bone(b,"pelvis",(0,0,.75),(0,0,.98),"root")
    add_bone(b,"spine",(0,0,.98),(0,0,1.30),"pelvis")
    add_bone(b,"chest",(0,0,1.30),(0,0,1.48),"spine")
    add_bone(b,"neck",(0,0,1.48),(0,0,h-.16),"chest")
    add_bone(b,"head",(0,0,h-.16),(0,0,h+.14),"neck")
    for side, prefix in [(-1,"L"),(1,"R")]:
        add_bone(b,prefix+"_upper_arm",(side*.30,0,1.42),(side*.44,0,1.18),"chest")
        add_bone(b,prefix+"_forearm",(side*.44,0,1.18),(side*.53,0,.96),prefix+"_upper_arm")
        add_bone(b,prefix+"_hand",(side*.53,0,.96),(side*.57,0,.86),prefix+"_forearm")
        add_bone(b,prefix+"_thigh",(side*.13,0,.78),(side*.14,0,.47),"pelvis")
        add_bone(b,prefix+"_shin",(side*.14,0,.47),(side*.14,0,.16),prefix+"_thigh")
        add_bone(b,prefix+"_foot",(side*.14,0,.16),(side*.14,-.20,.10),prefix+"_shin")
    # Stable authoring bones for modular traits; nondeforming until fitted.
    for name,parent,point in [
        ("attach_headwear","head",(0,0,h+.22)),
        ("attach_mask","head",(0,-.22,h+.04)),
        ("attach_back","chest",(0,.22,1.34)),
        ("attach_chest","chest",(0,-.21,1.34)),
        ("attach_weapon","R_hand",(.57,-.03,.88))
    ]:
        add_bone(b,name,point,(point[0],point[1],point[2]+.06),parent,deform=False)
    if profile["tail"]:
        # Match the procedural RACC tail: it sweeps toward +X and +Y,
        # rising from the right rear hip. The previous straight +Y chain
        # could not deform the visible tail segments correctly.
        add_bone(b,"tail_01",(.24,.14,.89),(.44,.225,.96),"pelvis")
        add_bone(b,"tail_02",(.44,.225,.96),(.64,.276,1.075),"tail_01")
        add_bone(b,"tail_03",(.64,.276,1.075),(.80,.285,1.21),"tail_02")
        add_bone(b,"attach_tail",(.24,.14,.89),(.24,.14,.95),"pelvis",deform=False)
    if profile["robe"]:
        for side,prefix in [(-1,"L"),(1,"R")]:
            add_bone(b,prefix+"_robe",(side*.20,0,.87),(side*.32,0,.26),"pelvis")
        add_bone(b,"attach_ember",(0,-.12,1.57),(0,-.12,1.63),"chest",deform=False)
    if collection=="589":
        add_bone(b,"attach_chain",(0,-.22,1.45),(0,-.22,1.51),"chest",deform=False)
    bpy.ops.object.mode_set(mode="OBJECT")
    rig["burncity_collection"]=collection
    rig["burncity_status"]="unskinned-authoring-rig"
    rig["runtime_approved"]=False
    return rig

def bind_racc_tail_segments(rig):
    """Bind segmented tail blockout to matching bones with rigid starter weights.

    This is an authoring preview, not smooth skinning or production deformation.
    Other body parts are intentionally untouched.
    """
    if rig.get("burncity_collection") != "racc":
        raise ValueError("RACC tail binding requires a RACC armature")
    bound=[]
    for index in range(6):
        name="Base_RACC_TailRing_%02d" % index
        obj=bpy.data.objects.get(name)
        if obj is None or obj.type!="MESH":
            raise ValueError("Missing tail segment: "+name)
        bone=("tail_01","tail_01","tail_02","tail_02","tail_03","tail_03")[index]
        if not obj.data.vertices:
            raise ValueError("Empty tail segment: "+name)
        group=obj.vertex_groups.get(bone) or obj.vertex_groups.new(name=bone)
        group.add([vertex.index for vertex in obj.data.vertices],1.0,"REPLACE")
        modifier=obj.modifiers.get("BURN_RACC_TailArmature")
        if modifier is None:
            modifier=obj.modifiers.new("BURN_RACC_TailArmature","ARMATURE")
        if modifier.type!="ARMATURE":
            raise ValueError("Conflicting tail modifier on "+name)
        modifier.object=rig
        obj["burncity_skinning_stage"]="rigid-tail-preview"
        obj["runtime_approved"]=False
        bound.append(name)
    rig["racc_rigid_tail_segment_count"]=len(bound)
    return bound

def bind_racc_facial_details(rig):
    """Rigidly bind facial accents to the head bone for initial pose previews.

    Preserves contrasting mask and muzzle materials. This is not facial rigging.
    """
    if rig.get("burncity_collection") != "racc":
        raise ValueError("RACC facial binding requires RACC rig")
    names=["Base_RACC_Nose","Base_RACC_ChinWhite",
           "Base_RACC_Muzzle_L","Base_RACC_Muzzle_R",
           "Base_RACC_WhiteMuzzleBib","Base_RACC_WhiskerPad_L",
           "Base_RACC_WhiskerPad_R","Base_RACC_EarRim_L",
           "Base_RACC_EarRim_R","Base_RACC_EarInterior_L",
           "Base_RACC_EarInterior_R","Base_RACC_MaskPatch_L",
           "Base_RACC_MaskPatch_R","Base_RACC_EyeHighlight_L",
           "Base_RACC_EyeHighlight_R"]
    missing=[name for name in names if bpy.data.objects.get(name) is None]
    if missing:
        raise ValueError("Missing RACC facial objects: "+", ".join(missing))
    for name in names:
        obj=bpy.data.objects[name]
        if obj.type!="MESH" or not obj.data.vertices:
            raise ValueError("Invalid RACC facial mesh: "+name)
        group=obj.vertex_groups.get("head") or obj.vertex_groups.new(name="head")
        group.add([v.index for v in obj.data.vertices],1.0,"REPLACE")
        modifier=obj.modifiers.get("BURN_RACC_FaceArmature")
        if modifier is None:
            modifier=obj.modifiers.new("BURN_RACC_FaceArmature","ARMATURE")
        if modifier.type!="ARMATURE":
            raise ValueError("Conflicting face modifier: "+name)
        modifier.object=rig
        obj["burncity_skinning_stage"]="rigid-face-preview"
        obj["runtime_approved"]=False
    rig["racc_rigid_face_mesh_count"]=len(names)
    return names

def main():
    args=sys.argv[sys.argv.index("--")+1:] if "--" in sys.argv else []
    if len(args)!=2:
        raise SystemExit("Usage: blender -b base.blend --python nft_avatar_base_rig.py -- <racc|fk|589> output.blend")
    collection, output=args
    rig=create_base_armature(collection)
    if collection=="racc":
        present=[bpy.data.objects.get("Base_RACC_TailRing_%02d"%i) for i in range(6)]
        if any(present):
            bind_racc_tail_segments(rig)
        if bpy.data.objects.get("Base_RACC_MaskPatch_L"):
            bind_racc_facial_details(rig)
    bpy.ops.wm.save_as_mainfile(filepath=output)
    print("Created authoring armature:",rig.name,"(mesh skinning and review still required)")

if __name__=="__main__":
    main()
