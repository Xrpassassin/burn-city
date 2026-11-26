"""Pack the Army Officer's four Sketchfab diffuse maps for the single-texture City VAT."""
import json
import math
import struct
import sys
from pathlib import Path

from PIL import Image

source, target = map(Path, sys.argv[1:])
target.mkdir(parents=True, exist_ok=True)
scene = json.loads((source / "scene.gltf").read_text())
buffer = scene["buffers"][0]
data = bytearray((source / buffer["uri"]).read_bytes())
primitives = [p for mesh in scene["meshes"] for p in mesh["primitives"]]
textures = {
    p["material"]: scene["materials"][p["material"]]["extensions"]
    ["KHR_materials_pbrSpecularGlossiness"]["diffuseTexture"]["index"]
    for p in primitives
}
tiles = {texture: i for i, texture in enumerate(dict.fromkeys(textures.values()))}
if len(tiles) != 4:
    raise ValueError("Expected four diffuse maps in the Army Officer source")

tile_size, inset = 512, 2
atlas = Image.new("RGBA", (tile_size * 2, tile_size * 2))
for texture, tile in tiles.items():
    image = scene["images"][scene["textures"][texture]["source"]]
    with Image.open(source / image["uri"]) as original:
        resized = original.convert("RGBA").resize((tile_size - 2 * inset,) * 2, Image.Resampling.LANCZOS)
    x = tile % 2 * tile_size + inset
    y = tile // 2 * tile_size + inset
    atlas.paste(resized, (x, y))

rewritten = set()
for primitive in primitives:
    tile = tiles[textures[primitive["material"]]]
    index = primitive["attributes"]["TEXCOORD_0"]
    uv = scene["accessors"][index]
    if index in rewritten or uv["type"] != "VEC2" or uv["componentType"] != 5126:
        raise ValueError("Expected independent float UVs for each primitive")
    rewritten.add(index)
    view = scene["bufferViews"][uv["bufferView"]]
    offset = view.get("byteOffset", 0) + uv.get("byteOffset", 0)
    step = view.get("byteStride", 8)
    minimum = [math.inf, math.inf]
    maximum = [-math.inf, -math.inf]
    for i in range(uv["count"]):
        at = offset + i * step
        u, v = struct.unpack_from("<ff", data, at)
        if not (0 <= u <= 1 and 0 <= v <= 1):
            raise ValueError("Tiled UVs cannot be packed into the officer atlas")
        mapped = tuple(
            (origin * tile_size + inset + value * (tile_size - 2 * inset)) / atlas.width
            for origin, value in zip((tile % 2, tile // 2), (u, v))
        )
        struct.pack_into("<ff", data, at, *mapped)
        minimum = [min(a, b) for a, b in zip(minimum, mapped)]
        maximum = [max(a, b) for a, b in zip(maximum, mapped)]
    uv.update(min=minimum, max=maximum)
    primitive["material"] = 0

atlas.save(target / "army_baseColor.png")
scene["images"] = [{"uri": "army_baseColor.png"}]
scene["textures"] = [{"source": 0}]
scene["materials"] = [{
    "name": "Army Officer Atlas",
    "pbrMetallicRoughness": {"baseColorTexture": {"index": 0}, "metallicFactor": 0, "roughnessFactor": .85},
    "alphaMode": "MASK", "alphaCutoff": .35, "doubleSided": True
}]
for key in ("extensionsUsed", "extensionsRequired"):
    if key in scene:
        scene[key] = [extension for extension in scene[key] if extension != "KHR_materials_pbrSpecularGlossiness"]
        if not scene[key]:
            del scene[key]

(target / buffer["uri"]).write_bytes(data)
(target / "scene.gltf").write_text(json.dumps(scene))
