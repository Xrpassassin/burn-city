# Blender headless: bake a Sketchfab CC BY model into small static "parts" for Burn City props.
# usage: blender -b --python build_prop.py -- <id> <src.glb> <outdir>
import bpy,bmesh,sys,json,math,mathutils,os
pid,src,outdir=sys.argv[-3:]
CFG={
 'sliding-door':dict(drop=[],rotz=90,fit=('h',2.25),tris=900,tex=128),
 'fisher-boat':dict(drop=[],rotz=0,fit=('len',4.2),tris=900,tex=64),
 'duck':dict(drop=['Icosphere'],rotz=0,fit=('len',0.42),tris=700,tex=64),
 'pigeon':dict(drop=[],rotz=0,fit=('len',0.32),tris=500,tex=16),
 'vending':dict(drop=[],rotz=0,fit=('h',1.9),tris=2400,tex=256),
 'arcade':dict(drop=['Plane_Material.001_0','Plane.001_Material.002_0'],rotz=0,fit=('h',1.85),tris=400,tex=256),
}[pid]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
sc=bpy.context.scene
for n in CFG['drop']:
  o=bpy.data.objects.get(n)
  if o: bpy.data.objects.remove(o,do_unlink=True)
def setact(prefix):
  for o in bpy.data.objects:
    if o.animation_data:
      for t in o.animation_data.nla_tracks: t.mute=True
      o.animation_data.action=None
  if not prefix: return
  for a in bpy.data.actions:
    if a.name.startswith(prefix):
      o=bpy.data.objects.get(a.name.split('_',1)[1])
      if o: o.animation_data_create(); o.animation_data.action=a
def under(o,root):
  while o:
    if o.name==root: return True
    o=o.parent
  return False
def snapshot(name,filt=lambda o:True,frame=1,pre=None):
  sc.frame_set(frame)
  if pre: pre(); bpy.context.view_layer.update()
  dg=bpy.context.evaluated_depsgraph_get();bm=bmesh.new();mats=[]
  for o in [o for o in bpy.data.objects if o.type=='MESH' and filt(o)]:
    oe=o.evaluated_get(dg);me=bpy.data.meshes.new_from_object(oe,preserve_all_data_layers=True,depsgraph=dg)
    me.transform(oe.matrix_world)
    remap=[]
    for m in me.materials:
      if m not in mats: mats.append(m)
      remap.append(mats.index(m))
    for p in me.polygons: p.material_index=remap[p.material_index] if remap else 0
    tmp=bmesh.new();tmp.from_mesh(me);
    me2=bpy.data.meshes.new('t');tmp.to_mesh(me2);tmp.free()
    bm.from_mesh(me2)
  me=bpy.data.meshes.new(name);bm.to_mesh(me);bm.free()
  for m in mats: me.materials.append(m)
  ob=bpy.data.objects.new(name,me);return ob
# reference frame from the full model at rest
setact(None)
parts={}
if pid=='sliding-door':
  setact('Geom3D.006Action');a1=bpy.data.actions[[a.name for a in bpy.data.actions if a.name.startswith('Geom3D.006Action')][0]]
  setact(None)
  for a in bpy.data.actions: pass
  # play both actions together
  def both():
    for a in bpy.data.actions:
      o=bpy.data.objects.get(a.name.split('_',1)[1]); o.animation_data_create(); o.animation_data.action=a
  both()
  fc=[f for f in a1.fcurves if f.data_path=='location' and f.array_index==2][0]
  fmax=int(max(fc.keyframe_points,key=lambda k:abs(k.co[1])).co[0])
  pa,pb='Geom3D.006_7','Geom3D.015_23'
  parts['frame']=snapshot('frame',lambda o:not under(o,pa) and not under(o,pb))
  parts['panelA']=snapshot('panelA',lambda o:under(o,pa)); parts['panelB']=snapshot('panelB',lambda o:under(o,pb))
  oa=snapshot('oa',lambda o:under(o,pa),frame=fmax); ob_=snapshot('ob',lambda o:under(o,pb),frame=fmax)
  ca=lambda o:sum((v.co for v in o.data.vertices),mathutils.Vector())/len(o.data.vertices)
  slide={'A':ca(oa)-ca(parts['panelA']),'B':ca(ob_)-ca(parts['panelB'])}
  for o in (oa,ob_): bpy.data.objects.remove(o)
elif pid=='pigeon':
  wings=['winga1_5','winga2_9']
  def fold():
    for w in wings: bpy.data.objects[w].scale=(0.28,0.28,0.28)
  setact('flapping'); parts['flapUp']=snapshot('flapUp',frame=1); parts['flapDown']=snapshot('flapDown',frame=4)
  setact('flapping'); parts['perch']=snapshot('perch',frame=4,pre=fold)
else:
  parts['body']=snapshot('body')
for o in list(bpy.data.objects):
  if o.name not in parts or o!=parts.get(o.name): bpy.data.objects.remove(o,do_unlink=True)
for o in parts.values(): sc.collection.objects.link(o)
# normalise: rotate, ground at y=0, centre, scale
allv=[o.data for o in parts.values()]
R=mathutils.Matrix.Rotation(math.radians(CFG['rotz']),4,'Z')
for me in allv: me.transform(R)
ref=parts.get('body') or parts.get('frame') or parts.get('flapUp')
vs=[v.co for v in ref.data.vertices];mn=mathutils.Vector([min(v[i] for v in vs) for i in range(3)]);mx=mathutils.Vector([max(v[i] for v in vs) for i in range(3)])
k,val=CFG['fit']; s=val/((mx.z-mn.z) if k=='h' else max(mx.y-mn.y,mx.x-mn.x))
c=mathutils.Vector(((mn.x+mx.x)/2,(mn.y+mx.y)/2,mn.z))
T=mathutils.Matrix.Scale(s,4)@mathutils.Matrix.Translation(-c)
if pid=='pigeon':
  pv=[v.co for v in parts['perch'].data.vertices];pz=min(v.z for v in pv)
  T=mathutils.Matrix.Scale(s,4)@mathutils.Matrix.Translation(-mathutils.Vector((c.x,c.y,pz)))
for me in allv: me.transform(T)
info={'id':pid,'scale':s,'parts':{}}
if pid=='sliding-door':
  info['slide']={k:list((R.to_3x3()@v)*s) for k,v in slide.items()}
  # blender (x,y,z) -> glTF (x,z,-y)
  info['slide']={k:[v[0],v[2],-v[1]] for k,v in info['slide'].items()}
for n,o in parts.items():
  bpy.context.view_layer.objects.active=o
  for x in bpy.context.view_layer.objects: x.select_set(x==o)
  bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.mesh.remove_doubles(threshold=0.0005*s**-1*0.01 if False else 1e-5);bpy.ops.object.mode_set(mode='OBJECT')
  t=sum(len(p.vertices)-2 for p in o.data.polygons)
  if t>CFG['tris']:
    m=o.modifiers.new('d','DECIMATE');m.ratio=CFG['tris']/t;bpy.ops.object.modifier_apply(modifier='d')
  vs=[v.co for v in o.data.vertices]
  info['parts'][n]={'tris':sum(len(p.vertices)-2 for p in o.data.polygons),'mats':len(o.data.materials),'min':[min(v[i] for v in vs) for i in (0,2,1)],'max':[max(v[i] for v in vs) for i in (0,2,1)]}
# shrink textures
for im in bpy.data.images:
  if im.size[0]>CFG['tex'] or im.size[1]>CFG['tex']:
    f=CFG['tex']/max(im.size);im.scale(max(1,int(im.size[0]*f)),max(1,int(im.size[1]*f)))
for m in bpy.data.materials:
  if m.blend_method=='BLEND' or 'glass' in m.name.lower(): info.setdefault('transparent',[]).append(m.name)
for x in bpy.context.view_layer.objects: x.select_set(x.name in parts)
os.makedirs(outdir,exist_ok=True)
bpy.ops.export_scene.gltf(filepath=f'{outdir}/{pid}.gltf',export_format='GLTF_SEPARATE',use_selection=True,export_image_format='WEBP',export_texture_dir=f'{pid}-tex',export_animations=False,export_skins=False,export_morph=False,export_apply=True,export_yup=True)
json.dump(info,open(f'{outdir}/{pid}.json','w'),indent=1)
print('##',json.dumps(info))
