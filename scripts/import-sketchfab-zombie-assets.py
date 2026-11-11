#!/usr/bin/env python3
"""Vendor two explicitly attributed CC-BY 4.0 human zombie GLBs from a public
third-party game which independently credits the original Sketchfab creators.

The upstream models are already optimized GLB+WebP bundles. This importer does
NOT access Sketchfab's private download API, scrape credentials or bypass
download controls. It downloads PUBLIC, directly hosted derivative copies and
checks their provenance, animation tracks, skinning and GLB integrity.

CI may use this to populate a *DRAFT* PR. Game release still requires a human
visual QA review: automated structural checks are not art approval.
"""
from __future__ import annotations
import hashlib
import json
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.parse import urlparse
import struct

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / "client" / "arena" / "assets" / "zombies"
HOST = "https://walking.morgannriu.fr"
CREDITS = HOST + "/assets/models/CREDITS.md"
MODELS = {
    "zombie-human-aiden.glb": {
        "filename": "zombie-aiden.glb",
        "sketchfab": "https://sketchfab.com/3d-models/zombie-rigged-animated-131688807ad444609ed9b2ed572dc4aa",
        "author": "Aiden Studios",
        "required_roles": (("Idle",), ("Walk1",), ("Attack1.001",)),
    },
    "zombie-hazmat-licensed.glb": {
        "filename": "zombie-hazmat.glb",
        "sketchfab": "https://sketchfab.com/3d-models/zombie-hazmat-49b3b4307f6a4d2386fdb02354158d04",
        "author": "LxNazarov",
        "required_roles": (("Zombie_Idle",), ("Zombie_Walk_Root",), ("Zombie_Skill",)),
    },
}
MAX_BYTES = 16 * 1024 * 1024


def download(url, maxbytes=MAX_BYTES):
    request = Request(url, headers={"User-Agent": "BURN-City-Game-Attribution-Validator/1.0", "Accept": "*/*"})
    with urlopen(request, timeout=35) as response:
        if urlparse(response.url).netloc != urlparse(HOST).netloc:
            raise RuntimeError("Unexpected asset redirect outside credited upstream host: " + response.url)
        data = response.read(maxbytes + 1)
    if not data or len(data) > maxbytes:
        raise RuntimeError(f"Asset exceeds size limit or is empty: {url}")
    return data


def inspect_glb(data, label, roles):
    if len(data) < 48 or data[:4] != b"glTF":
        raise RuntimeError(f"{label}: missing binary glTF magic")
    version, length, n, chunk_type = struct.unpack_from("<IIII", data, 4)
    if version != 2 or length != len(data) or chunk_type != 0x4E4F534A or n > len(data) - 20:
        raise RuntimeError(f"{label}: malformed GLB header")
    doc = json.loads(data[20:20 + n].decode("utf8"))
    if doc.get("asset", {}).get("version") != "2.0":
        raise RuntimeError(f"{label}: unsupported glTF version")
    if not doc.get("skins") or not doc.get("meshes") or not doc.get("animations"):
        raise RuntimeError(f"{label}: no skinned animated mesh")
    available = {clip.get("name", "") for clip in doc["animations"]}
    for aliases in roles:
        if not any(candidate in available for candidate in aliases):
            raise RuntimeError(f"{label}: missing required animation {aliases}, found {sorted(available)}")
    # Reject unexpectedly gigantic file before it causes mobile load failures.
    return {
        "sha256": hashlib.sha256(data).hexdigest(),
        "bytes": len(data),
        "skins": len(doc["skins"]),
        "meshes": len(doc["meshes"]),
        "clips": sorted(available),
    }


def main():
    credits = download(CREDITS, 100_000).decode("utf8")
    for name, model in MODELS.items():
        for proof in (model["filename"], model["author"], model["sketchfab"], "CC-BY 4.0"):
            if proof not in credits:
                raise RuntimeError(f"Public upstream attribution omits {proof!r}; refusing import")
    DEST.mkdir(parents=True, exist_ok=True)
    facts = {}
    for name, model in MODELS.items():
        outfile = DEST / name
        if outfile.exists():
            payload = outfile.read_bytes()
        else:
            payload = download(f"{HOST}/assets/models/{model['filename']}")
        facts[name] = inspect_glb(payload, name, model["required_roles"])
        if not outfile.exists():
            outfile.write_bytes(payload)
        print(name + ": " + json.dumps(facts[name]))
    evidence = {
        "license": "CC-BY-4.0",
        "upstream_credits": CREDITS,
        "third_party_source": HOST,
        "original_sources": {name: {"author": model["author"], "source": model["sketchfab"]} for name, model in MODELS.items()},
        "assets": facts,
        "note": "These original Sketchfab CC-BY models were repackaged by walking.morgannriu.fr. Visual approval remains separate.",
    }
    (DEST / "sketchfab-provenance.json").write_text(json.dumps(evidence, indent=2) + "\n")
    print("PASS: two valid skinned, animated CC-BY-4.0 human infected assets; ready for visual QA (not approved for merge).")


if __name__ == "__main__":
    main()
