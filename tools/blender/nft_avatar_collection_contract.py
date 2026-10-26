"""Collection base contracts: shared pipeline, collection-specific anatomy.

Pure Python: usable in Blender, CI, or the game asset build tooling.
This contract does NOT claim that a generated asset passes visual QA.
"""
from dataclasses import dataclass
from typing import Tuple

@dataclass(frozen=True)
class CollectionContract:
    key: str
    required_meshes: Tuple[str, ...]
    required_bones: Tuple[str, ...]
    trait_slots: Tuple[str, ...]
    locomotion_clips: Tuple[str, ...] = ("idle","walk","run","turn","interact")
    needs_tail: bool = False
    needs_robe: bool = False

SHARED_BONES = (
    "root","pelvis","spine","chest","neck","head",
    "L_upper_arm","L_forearm","L_hand","R_upper_arm","R_forearm","R_hand",
    "L_thigh","L_shin","L_foot","R_thigh","R_shin","R_foot",
)
CONTRACTS = {
    "racc": CollectionContract(
        key="racc",
        required_meshes=(
            "RACC_ContinuousBody_Blockout","Base_RACC_Nose",
            "Base_RACC_MaskPatch_L","Base_RACC_MaskPatch_R",
            "Base_RACC_EarRim_L","Base_RACC_EarRim_R",
            "Base_RACC_TailRing_00","Base_RACC_TailRing_01",
            "Base_RACC_TailRing_02","Base_RACC_TailRing_03",
            "Base_RACC_TailRing_04","Base_RACC_TailRing_05",
        ),
        required_bones=SHARED_BONES+("tail_01","tail_02","tail_03"),
        trait_slots=("headwear","eyes","mouth","outfit","back","handheld","tail"),
        needs_tail=True,
    ),
    "589": CollectionContract(
        key="589",
        required_meshes=("Body_Torso","Head_Base"),
        required_bones=SHARED_BONES,
        trait_slots=("headwear","eyes","mouth","clothing","necklace","handheld"),
    ),
    "fk": CollectionContract(
        key="fk",
        required_meshes=("Body_Torso","Head_Base","Base_Keeper_OuterRobe"),
        required_bones=SHARED_BONES+("L_robe","R_robe"),
        trait_slots=("hood","face","robe","relic","handheld"),
        needs_robe=True,
    ),
}
PRODUCTION_ORDER=("racc","589","fk")

def contract_for(key):
    try:
        return CONTRACTS[key]
    except KeyError:
        raise ValueError("Unsupported NFT collection: "+str(key)) from None

def audit_base(key, mesh_names, bone_names, available_clips=()):
    """Return deterministic, non-approving missing-component diagnostics."""
    contract=contract_for(key)
    meshes=set(mesh_names)
    bones=set(bone_names)
    clips=set(available_clips)
    missing_meshes=sorted(set(contract.required_meshes)-meshes)
    missing_bones=sorted(set(contract.required_bones)-bones)
    missing_clips=sorted(set(contract.locomotion_clips)-clips)
    return {
        "collectionKey":key,
        "missingMeshes":missing_meshes,
        "missingBones":missing_bones,
        "missingClips":missing_clips,
        "structurallyComplete":not missing_meshes and not missing_bones and not missing_clips,
        "visuallyApproved":False,
        "runtimeApproved":False,
    }
