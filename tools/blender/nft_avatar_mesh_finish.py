"""Non-destructive shading and topology QA for procedural NFT base meshes.

This improves surface normals, not underlying intersections or skinning.
Avoid smoothing small hard-surface details and eyes.
"""
import bpy
from mathutils import Vector

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
           "nonManifoldMeshes":[],"unappliedModifiers":[],
           "degenerateFaces":[],"materialSlots":0,"estimatedDrawCalls":0,
           "triangleBudgetWarning":False,"anatomyOverlapCandidates":[]}
    for obj in bpy.context.scene.objects:
        if obj.type!="MESH":
            continue
        stats["meshCount"]+=1
        stats["triangles"]+=sum(max(0,len(poly.vertices)-2) for poly in obj.data.polygons)
        stats["materialSlots"]+=len(obj.material_slots)
        stats["estimatedDrawCalls"]+=max(1,len(obj.material_slots))
        degenerate=sum(1 for poly in obj.data.polygons if poly.area<1e-10)
        if degenerate:
            stats["degenerateFaces"].append({"mesh":obj.name,"count":degenerate})
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
    stats["triangleBudgetWarning"]=stats["triangles"]>20000
    if collection_key=="racc":
        by_name={obj.name:obj for obj in bpy.context.scene.objects if obj.type=="MESH"}
        seam_pairs=[("Head_Base","Base_RACC_Cranium"),
                    ("Body_Torso","Base_RACC_ShoulderRuff_L"),
                    ("Body_Torso","Base_RACC_ShoulderRuff_R"),
                    ("Body_Pelvis","Base_RACC_Haunch_L"),
                    ("Body_Pelvis","Base_RACC_Haunch_R")]
        def bounds(obj):
            points=[obj.matrix_world @ Vector(c) for c in obj.bound_box]
            return ([min(p[i] for p in points) for i in range(3)],
                    [max(p[i] for p in points) for i in range(3)])
        for first,second in seam_pairs:
            if first not in by_name or second not in by_name:
                continue
            amin,amax=bounds(by_name[first])
            bmin,bmax=bounds(by_name[second])
            if all(min(amax[i],bmax[i])>max(amin[i],bmin[i]) for i in range(3)):
                stats["anatomyOverlapCandidates"].append([first,second])
    # Bounding-box overlap is a review hint, NOT proof of surface intersection.
    return stats
