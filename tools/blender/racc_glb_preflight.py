"""Inspect a RACC GLB's JSON chunk before launching Blender (stdlib only).

This is a structural input check, not an art or topology approval.
"""
import argparse
import json
from pathlib import Path
import struct

REQUIRED={
    "Body_Torso","Body_Pelvis","Head_Base","Base_RACC_Cranium",
    "Base_RACC_Cheek_L","Base_RACC_Cheek_R",
    "Base_RACC_LowerJaw","Base_RACC_Throat",
    "Base_RACC_ShoulderRuff_L","Base_RACC_ShoulderRuff_R",
    "Base_RACC_Haunch_L","Base_RACC_Haunch_R"
}

def inspect(path):
    with open(path,"rb") as handle:
        header=handle.read(12)
        if len(header)!=12:
            raise ValueError("Truncated GLB header")
        magic,version,length=struct.unpack("<4sII",header)
        if magic!=b"glTF" or version!=2:
            raise ValueError("Expected GLB version 2")
        if length!=Path(path).stat().st_size:
            raise ValueError("GLB declared length does not match file")
        chunk_header=handle.read(8)
        if len(chunk_header)!=8:
            raise ValueError("Missing GLB JSON chunk")
        chunk_length,chunk_type=struct.unpack("<I4s",chunk_header)
        if chunk_type!=b"JSON" or chunk_length>length-20:
            raise ValueError("Invalid GLB JSON chunk")
        raw=handle.read(chunk_length)
        if len(raw)!=chunk_length:
            raise ValueError("Truncated GLB JSON chunk")
        document=json.loads(raw.decode("utf-8"))
    meshes=document.get("meshes",[])
    nodes=document.get("nodes",[])
    names={node.get("name","") for node in nodes
           if isinstance(node,dict) and type(node.get("mesh")) is int
           and 0<=node["mesh"]<len(meshes)}
    missing=sorted(REQUIRED-names)
    duplicate_names=sorted(name for name in REQUIRED
                           if sum(1 for node in nodes if isinstance(node,dict)
                                  and node.get("name")==name
                                  and type(node.get("mesh")) is int)>1)
    return {"meshNodeCount":len(names),"requiredBodyNodeCount":len(REQUIRED),
            "missingBodyNodes":missing,"duplicateBodyNodes":duplicate_names,
            "pass":not missing and not duplicate_names,
            "note":"Node-name preflight only; Blender may rename objects on import."}

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("input",type=Path)
    args=parser.parse_args()
    result=inspect(args.input)
    print(json.dumps(result,indent=2))
    if not result["pass"]:
        raise SystemExit(2)

if __name__=="__main__":
    main()
