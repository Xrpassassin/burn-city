#!/usr/bin/env python3
"""REVIEW ONLY: convert the artist's officially downloaded free FBX to a GLB.
Never stage in main or auto-enable a community model. Blender runs -b.
"""
import bpy
import sys
from pathlib import Path

args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
if len(args) != 2:
    raise RuntimeError('Usage: blender -b --python convert-homefront-survivor-fbx.py -- <extracted-dir> <target.glb>')
source, target = Path(args[0]).resolve(), Path(args[1]).resolve()
if not source.is_dir():
    raise RuntimeError('No validated source archive extracted')
files = list(source.rglob('*.fbx')) + list(source.rglob('*.FBX'))
if not files:
    raise RuntimeError('FBX archive does not contain an FBX; do not invent a replacement')
if len(files) > 20:
    raise RuntimeError('Excessive number of FBX sources; manual review required')
preferred = sorted(files, key=lambda f: (('survivor' in f.name.lower()), f.stat().st_size), reverse=True)
fbx = preferred[0]
if fbx.stat().st_size < 100_000 or fbx.stat().st_size > 90_000_000:
    raise RuntimeError('Unexpected FBX size; manual inspection required')

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=str(fbx), use_image_search=True)
meshes = [ob for ob in bpy.data.objects if ob.type == 'MESH']
rigs = [ob for ob in bpy.data.objects if ob.type == 'ARMATURE']
if not meshes or not rigs:
    raise RuntimeError('The downloaded FBX has no mesh or humanoid armature')
if len(meshes) > 75:
    raise RuntimeError('Unusually many meshes in a single player model')
target.parent.mkdir(parents=True, exist_ok=True)
bpy.ops.export_scene.gltf(filepath=str(target), export_format='GLB',
                          export_animations=True, export_skins=True,
                          export_materials='EXPORT', use_selection=False)
print('Converted review-only GLB:',target.name,'mesh count',len(meshes),
      'rig count',len(rigs),'Blender actions',len(bpy.data.actions),
      'selected source FBX',fbx.name)
