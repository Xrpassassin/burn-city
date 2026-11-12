#!/usr/bin/env python3
"""Add ORIGINAL authored locomotion to the CC BY character GLB.

No Unity StarterAssets clips, downloaded animation datasets or unaudited external
motion data are copied into the output. The original author's armature, textured
mesh and three Idle clips remain unmodified. New Walk/Run/Jump pose samples are
generated deterministically for the existing Mixamo-style joints.
This is a gameplay-visual pilot, not a replacement for professional mocap.
"""
from __future__ import annotations
import hashlib
import json
import math
import struct
from pathlib import Path

ROOT = Path('survivor-source-audit')
MODEL = ROOT / 'homefront-male-survivor.glb'
SOURCE_SHA = 'd8aed7c8fccd3940f54867437afa99927784724dc232885d3dec130918d64b69'
MAGIC = 0x46546C67
JSON_TYPE = 0x4E4F534A
BIN_TYPE = 0x004E4942

raw = MODEL.read_bytes()
if hashlib.sha256(raw).hexdigest() != SOURCE_SHA:
    raise RuntimeError('Provisional source GLB hash changed; block unreviewed model')
magic, ver, declared = struct.unpack_from('<III', raw)
if magic != MAGIC or ver != 2 or declared != len(raw):
    raise RuntimeError('Invalid source glTF2 header')
offset = 12
json_len, json_type = struct.unpack_from('<II', raw, offset)
offset += 8
if json_type != JSON_TYPE:
    raise RuntimeError('Invalid source JSON chunk')
doc = json.loads(raw[offset:offset+json_len])
offset += json_len
bin_len, bin_type = struct.unpack_from('<II',raw,offset)
offset += 8
if bin_type != BIN_TYPE or offset + bin_len != len(raw):
    raise RuntimeError('Expected one complete binary chunk with embedded textures')
binary = bytearray(raw[offset:])
if len(doc.get('skins',[])) != 1 or len(doc.get('meshes',[])) != 1:
    raise RuntimeError('Only the verified single skinned author mesh is allowed')
if len(doc.get('images',[])) < 1 or len(doc.get('animations',[])) < 4:
    raise RuntimeError('Source model lost albedo texture or genuine Idle clips')
names = {node.get('name'): index for index,node in enumerate(doc['nodes'])}
bones = ['Hips','Spine','Spine1','LeftArm','RightArm','LeftForeArm',
         'RightForeArm','LeftUpLeg','RightUpLeg','LeftLeg','RightLeg',
         'LeftFoot','RightFoot']
required = {name: names.get('mixamorig:'+name) for name in bones}
if any(index is None for index in required.values()):
    raise RuntimeError('Creator skeleton mismatch; no guessed joint indices')
for key in ('accessors','bufferViews','buffers','animations'):
    if key not in doc or not isinstance(doc[key],list):
        raise RuntimeError('Source glTF missing '+key)
if len(doc['buffers'])!=1:
    raise RuntimeError('Source GLB must contain one embedded BIN buffer')

def align_binary():
    binary.extend(b'\0' * ((-len(binary)) % 4))

def add_accessor(blob, component_type, kind, count, minimum=None, maximum=None):
    align_binary()
    pos=len(binary)
    binary.extend(blob)
    view={'buffer':0,'byteOffset':pos,'byteLength':len(blob)}
    doc['bufferViews'].append(view)
    acc={'bufferView':len(doc['bufferViews'])-1,'componentType':component_type,
         'count':count,'type':kind}
    if minimum is not None:acc['min']=minimum
    if maximum is not None:acc['max']=maximum
    doc['accessors'].append(acc)
    return len(doc['accessors'])-1

def mul(a,b):
    x,y,z,w=a; X,Y,Z,W=b
    return (w*X+x*W+y*Z-z*Y, w*Y-x*Z+y*W+z*X,
            w*Z+x*Y-y*X+z*W, w*W-x*X-y*Y-z*Z)

def quat_delta(ax,ay=0.0,az=0.0):
    def one(axis,angle):
        v=math.sin(angle/2)
        return {'x':(v,0.,0.,math.cos(angle/2)),
                'y':(0.,v,0.,math.cos(angle/2)),
                'z':(0.,0.,v,math.cos(angle/2))}[axis]
    return mul(mul(one('x',ax),one('y',ay)),one('z',az))

def normalize(q):
    length=math.sqrt(sum(v*v for v in q))
    return tuple(v/length for v in q)

def joint_pose(kind, t, bone):
    if kind == 'Jump':
        airborne=math.sin(math.pi*t)
        crouch=max(0., math.sin(math.pi * min(1., t*1.4)))
        if bone in ('LeftUpLeg','RightUpLeg'):
            return (-.30*airborne-.10*crouch,0.,0.)
        if bone in ('LeftLeg','RightLeg'):
            return (.48*airborne+.08*crouch,0.,0.)
        if bone in ('LeftArm','RightArm'):
            return (-.22*airborne,0.,0.)
        if bone=='Spine':
            return (-.12*airborne,0.,0.)
        if bone=='Hips':
            return (.035*airborne,0.,0.)
        return (0.,0.,0.)
    phase=math.tau*t
    wave=math.sin(phase)
    lift_left=max(0.,math.sin(phase+math.pi*.5))
    lift_right=max(0.,math.sin(phase-math.pi*.5))
    run=kind=='Run'
    stride=.78 if run else .43
    if bone=='LeftUpLeg': return (stride*wave,0.,0.)
    if bone=='RightUpLeg': return (-stride*wave,0.,0.)
    if bone=='LeftLeg': return ((.72 if run else .42)*lift_left,0.,0.)
    if bone=='RightLeg': return ((.72 if run else .42)*lift_right,0.,0.)
    if bone=='LeftFoot': return (-.24*wave,0.,0.)
    if bone=='RightFoot': return (.24*wave,0.,0.)
    if bone=='LeftArm': return (-.48*wave if run else -.30*wave,0.,-.045)
    if bone=='RightArm': return (.48*wave if run else .30*wave,0.,.045)
    if bone=='LeftForeArm': return (-.34 if run else -.19,0.,0.)
    if bone=='RightForeArm': return (-.34 if run else -.19,0.,0.)
    if bone=='Spine': return (.10 if run else .035,.04*wave,0.)
    if bone=='Spine1':return (.04 if run else .02,-.04*wave,0.)
    if bone=='Hips':return (0.,.045*wave,.022*math.cos(phase))
    return (0.,0.,0.)

added={}
for kind, frames, duration in [('Walk',33,1.08),('Run',25,.76),('Jump',33,1.0)]:
    steps=[i/(frames-1) for i in range(frames)]
    times=[duration*t for t in steps]
    time_ref=add_accessor(struct.pack('<%df'%frames,*times),5126,'SCALAR',
                          frames,[0.],[duration])
    anim={'name':kind,'channels':[],'samplers':[]}
    for bone,index in required.items():
        rest=doc['nodes'][index].get('rotation',[0.,0.,0.,1.])
        samples=[]
        for t in steps:
            dx,dy,dz=joint_pose(kind,t,bone)
            samples.extend(normalize(mul(rest,quat_delta(dx,dy,dz))))
        sampler={'input':time_ref,
                 'output':add_accessor(struct.pack('<%df'%len(samples),*samples),5126,'VEC4',frames),
                 'interpolation':'LINEAR'}
        anim['samplers'].append(sampler)
        anim['channels'].append({'sampler':len(anim['samplers'])-1,
                                 'target':{'node':index,'path':'rotation'}})
    doc['animations'].append(anim)
    added[kind]={'frames':frames,'duration':duration,'joints':len(required)}

doc['buffers'][0]['byteLength']=len(binary)
document=json.dumps(doc,separators=(',',':'),ensure_ascii=False).encode('utf8')
document+=b' ' * ((-len(document))%4)
align_binary()
header=struct.pack('<III',MAGIC,2,12+8+len(document)+8+len(binary))
result=header+struct.pack('<II',len(document),JSON_TYPE)+document+struct.pack('<II',len(binary),BIN_TYPE)+binary
if len(result)>8_000_000:
    raise RuntimeError('The hero rig exceeds audited mobile file budget')
MODEL.write_bytes(result)
sha=hashlib.sha256(result).hexdigest()
audit={'source':'codersan / author-hosted CC BY 4.0 FBX',
       'sourceGLBSha256':SOURCE_SHA,'sha256':sha,'bytes':len(result),
       'originalIdles':['Idle','Idle2','Idle3'],
       'originalCreatedLocomotion':added,'unityStarterAssetsClipsUsed':False,
       'license':'CC-BY-4.0','status':'REVIEW_ONLY_NOT_DEPLOYED',
       'note':'New gait samples are original authored motion, not studio mocap; inspect foot-slide and crossfade in-browser before merge.'}
(ROOT/'original-motion-audit.json').write_text(json.dumps(audit,indent=2)+'\n')
print(json.dumps(audit,indent=2))
