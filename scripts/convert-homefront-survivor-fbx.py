#!/usr/bin/env python3
"""REVIEW ONLY: author FBX, artist-supplied albedo and three actual idle animations.

No third-party model is enabled in the game by this script. Blender -b.
"""
import bpy
import sys
from pathlib import Path

args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
if len(args) != 2:
    raise RuntimeError('Usage: blender -b --python convert-homefront-survivor-fbx.py -- <source-dir> <target.glb>')
source, target = Path(args[0]).resolve(), Path(args[1]).resolve()
if not source.is_dir():
    raise RuntimeError('No validated source archive extracted')
files = list(source.rglob('*.fbx')) + list(source.rglob('*.FBX'))
if not files or len(files) > 20:
    raise RuntimeError('Unexpected author FBX source count; review required')
# The free download includes a main skinned character plus Idle, Idle2 and
# Idle3 separate FBXs. Import ONLY the base model as geometry.
body_files = [p for p in files if 'zombieapocalypseman' in p.stem.lower()]
if len(body_files) != 1 or not 100_000 < body_files[0].stat().st_size < 90_000_000:
    raise RuntimeError('Expected the exact creator body FBX, not a substituted file')
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=str(body_files[0]),use_image_search=True)
meshes = [ob for ob in bpy.data.objects if ob.type == 'MESH']
rigs = [ob for ob in bpy.data.objects if ob.type == 'ARMATURE']
if not meshes or len(meshes) > 75 or len(rigs) != 1:
    raise RuntimeError('Original source is not one reasonable skinned humanoid rig')
body_rig=rigs[0]
body_bones=set(bone.name for bone in body_rig.data.bones)
if not any('Hips' in b for b in body_bones):
    raise RuntimeError('The expected Mixamo-style humanoid skeleton is missing')
target.parent.mkdir(parents=True,exist_ok=True)

# The FBX body material has no attached texture image on import. The archive
# supplies one author's 2048x2048 zombieApocalypseManBase.png separately.
# Embed its 1K downsample in the review GLB to protect phone texture memory.
albedo = [p for p in source.rglob('*.png') if 'zombieapocalypsemanbase' in p.stem.lower()]
if len(albedo) != 1:
    raise RuntimeError('The original author albedo PNG was not present')
image=bpy.data.images.load(str(albedo[0]),check_existing=True)
if image.size[0]<256 or image.size[1]<256:
    raise RuntimeError('The source texture is unexpectedly small')
image.scale(1024,1024)
image.filepath_raw=str(target.parent/'survivor-albedo-1024.png')
image.file_format='PNG'
image.save()
image.pack()
for mesh in meshes:
    for material in mesh.data.materials:
        if not material:
            continue
        material.use_nodes=True
        nodes=material.node_tree.nodes
        bsdf=next((node for node in nodes if node.type=='BSDF_PRINCIPLED'),None)
        if bsdf is None:
            bsdf=nodes.new('ShaderNodeBsdfPrincipled')
        image_node=nodes.new('ShaderNodeTexImage')
        image_node.name='Artist Albedo / CC BY 4.0'
        image_node.image=image
        material.node_tree.links.new(image_node.outputs['Color'],bsdf.inputs['Base Color'])
        material.diffuse_color=(1,1,1,1)

# The separate free download includes THREE actual Idle FBXs; the base FBX's
# 2-pose Mixamo export is not a playable animation. Retain the real animations
# with a matching bone-name track and NLA clips, never invent Walk/Run.
body_rig.animation_data_create()
body_rig.animation_data.action=None
imported_clips=[]
for idle_name in ('Idle','Idle2','Idle3'):
    candidate=[p for p in files if p.stem.lower()==idle_name.lower()]
    if len(candidate)!=1:
        raise RuntimeError('Creator source missing genuine '+idle_name+' animation')
    existing=set(bpy.data.objects)
    bpy.ops.import_scene.fbx(filepath=str(candidate[0]),use_image_search=False)
    recent=set(bpy.data.objects)-existing
    clip_arms=[ob for ob in recent if ob.type=='ARMATURE' and ob.animation_data and ob.animation_data.action]
    if not clip_arms:
        raise RuntimeError('Idle FBX has no imported armature action: '+idle_name)
    source_arm=clip_arms[0]
    matches=len(body_bones.intersection(set(b.name for b in source_arm.data.bones)))
    if matches<min(20,round(len(body_bones)*.6)):
        raise RuntimeError('Artist idle animation skeleton does not match base rig: '+idle_name)
    action=source_arm.animation_data.action
    if len(action.fcurves)<5 or (action.frame_range[1]-action.frame_range[0])<5:
        raise RuntimeError('Source idle is not an animated clip: '+idle_name)
    action.name='Author_'+idle_name
    action.use_fake_user=True
    track=body_rig.animation_data.nla_tracks.new()
    track.name=idle_name
    track.strips.new(idle_name,1,action)
    imported_clips.append((idle_name,int(action.frame_range[1]-action.frame_range[0]),len(action.fcurves)))
    # Delete temporary pose source objects only; NLA tracks keep the action.
    for obj in list(recent):
        bpy.data.objects.remove(obj,do_unlink=True)

if len(imported_clips)!=3:
    raise RuntimeError('Not all three official idle clips were imported')
# No standalone walk/run clips in the original author archive. Such clips must
# be legally sourced and retargeted separately before this can become a hero.
bpy.ops.export_scene.gltf(filepath=str(target),export_format='GLB',
    export_animations=True,export_skins=True,export_nla_strips=True,
    export_materials='EXPORT',use_selection=False)
print('Converted review-only GLB',target.name,'meshes',len(meshes),
      'rig bones',len(body_bones),'embedded albedo',image.name,
      'source idle actions',imported_clips)
