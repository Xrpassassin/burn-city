"""Versioned, content-addressed NFT avatar package manifest.

Pure Python; no Blender dependency. A manifest describes an exported asset,
not permission to publish it. All file paths must stay inside package root.
"""
import hashlib
import json
from pathlib import Path, PurePosixPath

SCHEMA_VERSION=1
ALLOWED_ROLES={"model","skeleton","animation","thumbnail","metadata"}

def safe_relative_path(value):
    if not isinstance(value,str) or not value or "\\" in value:
        raise ValueError("Invalid package path")
    p=PurePosixPath(value)
    if p.is_absolute() or any(part in (".","..") for part in value.split("/")) or ":" in value:
        raise ValueError("Package path must be relative and traversal-free")
    return str(p)

def file_digest(path):
    digest=hashlib.sha256()
    with open(path,"rb") as handle:
        for chunk in iter(lambda:handle.read(1024*1024),b""):
            digest.update(chunk)
    return digest.hexdigest()

def build_manifest(collection_key,version,package_root,assets,approved=False):
    if not collection_key or not isinstance(collection_key,str):
        raise ValueError("Collection key required")
    if not isinstance(version,str) or not version:
        raise ValueError("Version required")
    root=Path(package_root).resolve(strict=True)
    records=[]
    seen=set()
    for asset in assets:
        role=asset["role"]
        if role not in ALLOWED_ROLES:
            raise ValueError("Unknown asset role: "+str(role))
        relative=safe_relative_path(asset["path"])
        if relative in seen:
            raise ValueError("Duplicate package asset: "+relative)
        seen.add(relative)
        file=(root/relative).resolve(strict=True)
        if not file.is_relative_to(root) or not file.is_file():
            raise ValueError("Asset escapes package root: "+relative)
        records.append({"path":relative,"role":role,"bytes":file.stat().st_size,
                        "sha256":file_digest(file)})
    if not any(row["role"]=="model" for row in records):
        raise ValueError("At least one model asset required")
    return {"schemaVersion":SCHEMA_VERSION,"collectionKey":collection_key,
            "version":version,"runtimeApproved":bool(approved),
            "assets":sorted(records,key=lambda row:row["path"])}

def verify_manifest(manifest,package_root):
    if manifest.get("schemaVersion")!=SCHEMA_VERSION:
        raise ValueError("Unsupported manifest schema")
    root=Path(package_root).resolve(strict=True)
    seen=set()
    for row in manifest.get("assets",[]):
        relative=safe_relative_path(row["path"])
        if relative in seen:
            raise ValueError("Duplicate manifest asset")
        seen.add(relative)
        if row["role"] not in ALLOWED_ROLES:
            raise ValueError("Invalid role")
        path=(root/relative).resolve(strict=True)
        if not path.is_relative_to(root) or not path.is_file():
            raise ValueError("Asset escapes package root")
        if path.stat().st_size!=row["bytes"] or file_digest(path)!=row["sha256"]:
            raise ValueError("Asset integrity mismatch: "+relative)
    if not any(row["role"]=="model" for row in manifest.get("assets",[])):
        raise ValueError("Missing model")
    return True

def write_manifest(manifest,path):
    Path(path).write_text(json.dumps(manifest,sort_keys=True,indent=2)+"\n",encoding="utf-8")
