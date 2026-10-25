"""Non-destructive shading and topology QA for procedural NFT base meshes.

This improves surface normals, not underlying intersections or skinning.
Avoid smoothing small hard-surface details and eyes.
"""
import bpy

ORGANIC_PREFIXES=(
    "Body_Torso","Body_Pelvis","Head_Base","Face_Nose",
    "Shoulder_","Hand_","Base_RACC_Cheek_","Base_RACC_InnerEar_",
    "Base_RACC_Paw_","Base_RACC_Muzzle_","Base_RACC_TailTip",
    "Base_RACC_Cranium","Base_RACC_WhiteMuzzleBib",
    "Base_RACC_WhiskerPad_","Base_RACC_LowerJaw",
    "Base_RACC_Throat","Base_RACC_HindPaw_",
    "Base_RACC_ShoulderRuff_","Base_RACC_Haunch_",
)
def finish_collection_base(collection_key):
    stats={"collection":collection_key,"meshCount":0,"triangles":0,"organicSmoothed":0,
           "nonManifoldMeshes":[],"unappliedModifiers":[]}
    for obj in bpy.context.scene.objects:
        if obj.type!="MESH":
            continue
        stats["meshCount"]+=1
        stats["triangles"]+=sum(max(0,len(poly.vertices)-2) for poly in obj.data.polygons)
        if collection_key=="racc" and obj.name.startswith(ORGANIC_PREFIXES):
            for face in obj.data.polygons:
                face.use_smooth=True
            stats["organicSmoothed"]+=1
        if obj.modifiers:
            stats["unappliedModifiers"].append(obj.name)
        # This is a heuristic diagnostic, not a guarantee of watertightness.
        edge_uses={}
        for poly in obj.data.polygons:
            for edge in poly.edge_keys:
                key=tuple(sorted(edge))
                edge_uses[key]=edge_uses.get(key,0)+1
        if any(count!=2 for count in edge_uses.values()):
            stats["nonManifoldMeshes"].append(obj.name)
    return stats
