"""Collection-specific base silhouette refinement for Blender blockout candidates.

This module adds only collection identity features; no token traits, licensing
claims, rig weights or runtime approvals. Coordinates are Blender Z-up, facing -Y.
"""
import bpy
from mathutils import Vector

def add_base_details(key, head_y, materials, sphere, cube, cone, cylinder, curve):
    fur, light, dark, outfit, accent, metal = materials
    if key == "racc":
        # Distinct cheek mass, inner ears, brow ridge, paws and layered tail volume.
        for side, tag in [(-1,"L"),(1,"R")]:
            sphere("Base_RACC_Cheek_"+tag,(side*.164,-.126,head_y-.075),(.112,.105,.095),fur,20,12)
            sphere("Base_RACC_InnerEar_"+tag,(side*.151,-.046,head_y+.249),(.047,.021,.071),light,12,8)
            sphere("Base_RACC_Brow_"+tag,(side*.098,-.190,head_y+.102),(.088,.035,.034),dark,12,8)
            sphere("Base_RACC_Paw_"+tag,(side*.40,-.01,.88),(.084,.080,.075),fur,16,10)
            for digit in range(3):
                sphere("Base_RACC_PawDigit_%s_%d"%(tag,digit),
                       (side*(.35+digit*.04),-.082,.855),(.021,.032,.029),dark,10,8)
        sphere("Base_RACC_Muzzle_L",(-.065,-.238,head_y-.09),(.09,.061,.065),light,16,10)
        sphere("Base_RACC_Muzzle_R",(.065,-.238,head_y-.09),(.09,.061,.065),light,16,10)
        sphere("Base_RACC_TailTip",(.75,.18,1.06),(.105,.103,.105),dark,16,10)
    elif key == "fk":
        # Robe layers and cowl must read at distance, independent of NFT traits.
        cone("Base_Keeper_UnderRobe",(0,0,.69),.35,.23,.87,dark)
        cone("Base_Keeper_OuterRobe",(0,.015,.78),.41,.26,.78,outfit)
        cube("Base_Keeper_ShoulderMantle",(0,.015,1.40),(.68,.46,.16),outfit,.10)
        sphere("Base_Keeper_HoodVolume",(0,.058,head_y+.015),(.305,.265,.29),dark,20,14)
        sphere("Base_Keeper_FaceOpening",(0,-.207,head_y-.015),(.206,.067,.214),fur,20,12)
        for side,tag in [(-1,"L"),(1,"R")]:
            curve("Base_Keeper_RobeSeam_"+tag,[(side*.26,-.25,1.22),(side*.31,-.29,.89),(side*.34,-.27,.41)],light,.014)
            cube("Base_Keeper_Cuff_"+tag,(side*.40,-.015,.91),(.18,.21,.12),light,.025)
        cylinder("Base_Keeper_CollarClasp",(0,-.235,1.42),.055,.025,metal,rotation=(1.5708,0,0))
    elif key == "589":
        # Streetwear layers, fitted silhouette and hardware, without token traits.
        cube("Base_Protocol_Jacket",(0,.015,1.16),(.64,.43,.59),outfit,.095)
        cube("Base_Protocol_InnerShirt",(0,-.226,1.17),(.29,.032,.42),dark,.018)
        for side,tag in [(-1,"L"),(1,"R")]:
            cube("Base_Protocol_JacketLapel_"+tag,(side*.15,-.235,1.39),(.13,.035,.25),light,.025)
            cube("Base_Protocol_Cuff_"+tag,(side*.40,0,.91),(.17,.20,.11),dark,.025)
            cube("Base_Protocol_Pocket_"+tag,(side*.175,-.237,1.08),(.15,.024,.12),dark,.018)
            cube("Base_Protocol_KneePanel_"+tag,(side*.13,-.098,.42),(.18,.035,.16),outfit,.024)
        cube("Base_Protocol_Belt",(0,-.01,.81),(.49,.38,.075),dark,.02)
        cube("Base_Protocol_Buckle",(0,-.216,.81),(.085,.022,.062),metal,.012)
