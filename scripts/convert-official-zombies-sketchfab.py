#!/usr/bin/env python3
"""OFFLINE SAFETY REVIEW: extract official Sketchfab glTF zip and convert GLB.

This does not enable a model or write game manifests. GitHub Actions runs
this only through manual workflow_dispatch after the user's own Sketchfab
OAuth token has been configured. No viewer ripping and no third-party URLs.
"""
from __future__ import annotations
import json, pathlib, shutil, sys, zipfile

args=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
kind=args[0] if args else ''
if kind not in ('nurse','blob'):
    raise RuntimeError('Select an explicitly approved source identity')
folder=pathlib.Path('zombie-special-audit')/kind
archive=folder/'official-gltf.zip'
out=folder/'extracted'
if not archive.is_file() or archive.stat().st_size>115_000_000:
    raise RuntimeError('Missing or oversized authenticated source archive')
with zipfile.ZipFile(archive) as z:
    infos=z.infolist()
    if not infos or len(infos)>1000:
        raise RuntimeError('Unusually many imported ZIP entries')
    total=0
    for info in infos:
        p=pathlib.PurePosixPath(info.filename)
        if p.is_absolute() or '..' in p.parts or info.filename.startswith('\\'):
            raise RuntimeError('Unsafe ZIP path')
        if info.file_size>80_000_000:
            raise RuntimeError('Unexpected individual model blob size')
        total+=info.file_size
        if total>250_000_000:
            raise RuntimeError('ZIP expands beyond reviewed 250 MB limit')
        if (info.external_attr >> 16) & 0o170000 == 0o120000:
            raise RuntimeError('ZIP symlinks not permitted')
    out.mkdir(parents=True,exist_ok=True)
    for info in infos:
        if info.is_dir():continue
        target=out.joinpath(*pathlib.PurePosixPath(info.filename).parts)
        if out.resolve() not in target.resolve().parents:
            raise RuntimeError('ZIP extraction path outside destination')
        target.parent.mkdir(parents=True,exist_ok=True)
        with z.open(info) as source,open(target,'wb') as dest:
            shutil.copyfileobj(source,dest)

import bpy
files=list(out.rglob('*.gltf'))+list(out.rglob('*.glb'))
if len(files)!=1:
    raise RuntimeError('Expected exactly one Sketchfab glTF source scene')
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(files[0].resolve()))
meshes=[o for o in bpy.data.objects if o.type=='MESH']
arms=[o for o in bpy.data.objects if o.type=='ARMATURE']
if not meshes or len(meshes)>150:
    raise RuntimeError('Official download lacks valid bounded mesh structure')
triangles=sum(len(p.vertices)-2 for o in meshes for p in o.data.polygons)
if triangles<500 or triangles>55000:
    raise RuntimeError('Unexpected verified special model triangle count')
if kind=='nurse' and not arms:
    raise RuntimeError('The selected nurse author asset is not rigged as described')
actions = sorted(bpy.data.actions, key=lambda action: action.name)
armatures = [
    {
        'name': armature.name,
        'restWorldMatrix': [list(row) for row in armature.matrix_world],
        'bones': [
            {
                'name': bone.name,
                'parent': bone.parent.name if bone.parent else None,
                'deform': bone.use_deform,
                'restMatrix': [list(row) for row in bone.matrix_local],
            }
            for bone in armature.data.bones
        ],
    }
    for armature in arms
]
materials=sum(bool(o.data.materials) for o in meshes)
images=[x for x in bpy.data.images if x.source=='FILE' and x.size[0]>0]
if not materials or not images:
    raise RuntimeError('No textured material inputs were imported')
for image in images:
    # Bound mobile budget while preserving artist UVs and base color.
    if max(image.size)>2048:
        factor=2048/max(image.size)
        image.scale(max(1,round(image.size[0]*factor)),max(1,round(image.size[1]*factor)))
    image.pack()
bpy.ops.export_scene.gltf(filepath=str((folder/(kind+'-source-review.glb')).resolve()),
 export_format='GLB',export_skins=True,export_animations=True,
 export_materials='EXPORT',use_selection=False)
audit={'model':kind,'status':'SOURCE_CONVERSION_ONLY_NOT_LIVE',
 'meshCount':len(meshes),'armatureCount':len(arms),'triangles':triangles,
 'materials':materials,'images':len(images),'animations':[action.name for action in actions],
 'framesPerSecond':bpy.context.scene.render.fps / bpy.context.scene.render.fps_base,
 'animationFrames':[{'name':action.name,'range':list(action.frame_range)} for action in actions],
 'armatures':armatures,
 'note':'Requires rig/clip/texture and license acceptance plus reviewed PR before enabling installed:true'}
(folder/'scene-review.json').write_text(json.dumps(audit,indent=2)+'\n')
print(json.dumps(audit,indent=2))
