"""Experimental RACC organic body fusion for Blender authoring.

Usage: blender -b --python tools/blender/nft_avatar_racc_body_fusion.py -- input.glb output.blend

Creates one continuous *body blockout* from selected overlapping organic shapes.
This is NOT production retopology, skinning, or a visually approved character.
The originals remain in a hidden backup collection for reversible iteration.
"""
import bpy
import sys

BODY_NAMES = (
    "Body_Torso", "Body_Pelvis", "Head_Base", "Base_RACC_Cranium",
    "Base_RACC_Cheek_L", "Base_RACC_Cheek_R",
    "Base_RACC_LowerJaw", "Base_RACC_Throat",
    "Base_RACC_ShoulderRuff_L", "Base_RACC_ShoulderRuff_R",
    "Base_RACC_Haunch_L", "Base_RACC_Haunch_R",
)
VOXEL_SIZE = 0.025

def fuse_racc_body(voxel_size=VOXEL_SIZE):
    if not (0.01 <= voxel_size <= 0.06):
        raise ValueError("voxel size outside supported blockout range")
    originals=[bpy.data.objects.get(name) for name in BODY_NAMES]
    missing=[name for name,obj in zip(BODY_NAMES,originals) if obj is None or obj.type!="MESH"]
    if missing:
        raise ValueError("Missing RACC body meshes: "+", ".join(missing))
    originals=list(originals)
    backups=bpy.data.collections.new("RACC_Source_Body_Backup")
    bpy.context.scene.collection.children.link(backups)
    duplicates=[]
    for obj in originals:
        duplicate=obj.copy()
        duplicate.data=obj.data.copy()
        backups.objects.link(duplicate)
        duplicate.name="Source_"+obj.name
        duplicates.append(duplicate)
    for obj in originals:
        bpy.data.objects.remove(obj,do_unlink=True)
    # Move backup objects to a collection that is hidden from export and viewport.
    backups.hide_render=True
    backups.hide_viewport=False
    for obj in duplicates:
        obj.hide_render=True
        obj.hide_set(True)
    # Recreate temporary working geometry from source backups in scene root.
    working=[]
    for obj in duplicates:
        temp=obj.copy()
        temp.data=obj.data.copy()
        bpy.context.scene.collection.objects.link(temp)
        temp.hide_render=False
        temp.hide_set(False)
        temp.hide_viewport=False
        working.append(temp)
    bpy.ops.object.select_all(action="DESELECT")
    for obj in working:
        obj.select_set(True)
    bpy.context.view_layer.objects.active=working[0]
    bpy.ops.object.join()
    joined=bpy.context.view_layer.objects.active
    joined.name="RACC_ContinuousBody_Blockout"
    # Voxel remesh joins intersecting volumes into one connected outer surface.
    # Preserve original multi-material geometry in the backup for manual retopo.
    modifier=joined.modifiers.new("Body voxel fusion","REMESH")
    modifier.mode="VOXEL"
    modifier.voxel_size=voxel_size
    modifier.use_smooth_shade=True
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    smooth=joined.modifiers.new("Subtle surface relaxation","SMOOTH")
    smooth.factor=0.7
    smooth.iterations=2
    bpy.ops.object.modifier_apply(modifier=smooth.name)
    for polygon in joined.data.polygons:
        polygon.use_smooth=True
    joined["burncity_asset_stage"]="fused-blockout-needs-retopology"
    joined["runtime_approved"]=False
    joined["source_mesh_count"]=len(BODY_NAMES)
    joined["voxel_size_m"]=voxel_size
    return joined

def main():
    args=sys.argv[sys.argv.index("--")+1:] if "--" in sys.argv else []
    if len(args)!=2:
        raise SystemExit("Usage: blender -b --python nft_avatar_racc_body_fusion.py -- input.glb output.blend")
    source,destination=args
    import os
    if not source.lower().endswith(".glb") or not destination.lower().endswith(".blend"):
        raise SystemExit("Expected input.glb and output.blend")
    if not os.path.isfile(source):
        raise SystemExit("Missing GLB: "+source)
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    bpy.ops.import_scene.gltf(filepath=os.path.abspath(source))
    fused=fuse_racc_body()
    bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(destination))
    print("RACC fused blockout:",fused.name,len(fused.data.polygons),"faces; retopology required")

if __name__=="__main__":
    main()
