# Blender headless: normalise a Sketchfab CC BY model into a small static glTF
# for the Estates Tycoon upgrade renderer (client/assets/estates-upgrades/).
# usage: blender -b --python build_upgrade_model.py -- <id> <src.glb> <outdir>
# Parts are exported as separate named meshes (glTF Y-up, metres, grounded at
# y=0, centred on x/z, front facing +Z) and summarised in <id>.json.
import bpy,bmesh,sys,json,math,mathutils,os
pid,src,outdir=sys.argv[-3:]
CFG={
 # parts: name -> object-name prefixes (None = everything not claimed by another part)
 'helicopter':dict(rotz=-90,fit=('len',8.4,['Copter']),tris=1900,tex=256,
   parts={'rotor':['Propeller_2'],'tail':['Propeller'],'body':None},pivots=['rotor','tail'],split_paint='body'),
 'fire-pit':dict(rotz=0,fit=('len',1.45,None),tris=1500,tex=256,parts={'body':None}),
 'camera':dict(rotz=0,fit=('len',.42,None),tris=820,tex=256,parts={'body':None}),
 'gnome':dict(rotz=0,fit=('h',.5,None),tris=1200,tex=256,parts={'body':None}),
 'rocks':dict(rotz=0,fit=('len',.5,None),tris=400,tex=256,parts={'body':None},loose=True),
 # drop: source objects removed (backdrops, floor cards); crop=((lo),(hi)) keeps faces
 # whose centre lies in a source-space box (one prop out of a multi-prop pack);
 # xsplit: objects left/right of x=0 become two parts (two bushes in one file).
 'wall-lantern':dict(rotz=0,fit=('h',.36,None),tris=140,tex=256,parts={'body':None}),
 'path-lamp':dict(rotz=0,fit=('h',1.0,None),tris=700,tex=256,parts={'body':None}),
 'arcade':dict(opaque=['Cabnet'],rotz=0,fit=('h',1.75,None),tris=420,tex=256,parts={'body':None},drop=['Plane','Plane.001']),
 'workbench':dict(rotz=90,fit=('len',1.4,None),tris=700,tex=256,parts={'body':None}),
 'flower-bush':dict(rotz=0,fit=('h',.6,None),tris=900,tex=256,parts={'leafy':None,'bloom':None},xsplit=('leafy','bloom')),
}[pid]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
sc=bpy.context.scene
for o in bpy.data.objects:
  if o.animation_data: o.animation_data.action=None
for o in [o for o in bpy.data.objects if o.type=='MESH']:
  if o.parent and any(o.parent.name==d for d in CFG.get('drop',[])): bpy.data.objects.remove(o,do_unlink=True)
meshes=[o for o in bpy.data.objects if o.type=='MESH']
def owner(o):
  if CFG.get('xsplit'):
    c=sum((o.matrix_world@mathutils.Vector(b) for b in o.bound_box),mathutils.Vector())/8
    return CFG['xsplit'][0 if c.x<0 else 1]
  for name,prefixes in CFG['parts'].items():
    if prefixes and any(o.name.startswith(p+'_') or o.name==p for p in prefixes): return name
  return next(n for n,p in CFG['parts'].items() if p is None)
def merged(name,objs):
  dg=bpy.context.evaluated_depsgraph_get();bm=bmesh.new();mats=[]
  for o in objs:
    oe=o.evaluated_get(dg);me=bpy.data.meshes.new_from_object(oe,preserve_all_data_layers=True,depsgraph=dg)
    me.transform(oe.matrix_world);remap=[]
    for m in me.materials:
      if m not in mats: mats.append(m)
      remap.append(mats.index(m))
    for p in me.polygons: p.material_index=remap[p.material_index] if remap else 0
    bm.from_mesh(me)
  me=bpy.data.meshes.new(name);bm.to_mesh(me);bm.free()
  for m in mats: me.materials.append(m)
  return bpy.data.objects.new(name,me)
groups={}
for o in meshes: groups.setdefault(owner(o),[]).append(o)
parts={n:merged(n,objs) for n,objs in groups.items()}
for o in meshes: bpy.data.objects.remove(o,do_unlink=True)
for o in parts.values(): sc.collection.objects.link(o)
if CFG.get('crop'):
  lo,hi=CFG['crop']
  for o in parts.values():
    bm=bmesh.new();bm.from_mesh(o.data)
    bmesh.ops.delete(bm,geom=[f for f in bm.faces if not all(lo[i]<=f.calc_center_median()[i]<=hi[i] for i in range(3))],context='FACES')
    bmesh.ops.delete(bm,geom=[v for v in bm.verts if not v.link_faces],context='VERTS')
    bm.to_mesh(o.data);bm.free()
if CFG.get('loose'):
  # Rock pack: keep the two largest separate stones as rock-a / rock-b.
  o=parts.pop('body');bpy.context.view_layer.objects.active=o;o.select_set(True)
  bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.mesh.remove_doubles(threshold=.002);bpy.ops.mesh.separate(type='LOOSE');bpy.ops.object.mode_set(mode='OBJECT')
  pieces=sorted([x for x in bpy.data.objects if x.type=='MESH'],key=lambda x:-len(x.data.polygons))
  # skip the tall monolith (first) for a pond edge; take the next two chunky stones
  chosen=pieces[1:3] if len(pieces)>2 else pieces[:2]
  for x in pieces:
    if x not in chosen: bpy.data.objects.remove(x,do_unlink=True)
  parts={}
  for name,x in zip(['rock-a','rock-b'],chosen):
    x.name=name;vs=[x.matrix_world@v.co for v in x.data.vertices]
    c=mathutils.Vector([(min(v[i] for v in vs)+max(v[i] for v in vs))/2 for i in range(3)]);c.z=min(v.z for v in vs)
    x.data.transform(x.matrix_world);x.matrix_world=mathutils.Matrix.Identity(4)
    x.data.transform(mathutils.Matrix.Translation(-c));parts[name]=x
R=mathutils.Matrix.Rotation(math.radians(CFG['rotz']),4,'Z')
for o in parts.values(): o.data.transform(R)
kind,val,ref=CFG['fit']
refv=[v.co for n,o in parts.items() for v in o.data.vertices if (ref is None or n=='body')]
if ref:  # fit on named source objects only (e.g. fuselage without rotor sweep)
  refv=[v.co for v in parts['body'].data.vertices]
mn=mathutils.Vector([min(v[i] for v in refv) for i in range(3)]);mx=mathutils.Vector([max(v[i] for v in refv) for i in range(3)])
s=val/((mx.z-mn.z) if kind=='h' else max(mx.y-mn.y,mx.x-mn.x))
allv=[v.co for o in parts.values() for v in o.data.vertices]
gz=min(v.z for v in allv)
c=mathutils.Vector(((mn.x+mx.x)/2,(mn.y+mx.y)/2,gz))
if CFG.get('loose'): c=mathutils.Vector((0,0,0))
T=mathutils.Matrix.Scale(s,4)@mathutils.Matrix.Translation(-c)
for o in parts.values(): o.data.transform(T)
info={'id':pid,'source_scale':s,'parts':{}}
for n in CFG.get('pivots',[]):
  vs=[v.co for v in parts[n].data.vertices]
  p=mathutils.Vector([(min(v[i] for v in vs)+max(v[i] for v in vs))/2 for i in range(3)])
  parts[n].data.transform(mathutils.Matrix.Translation(-p))
  info.setdefault('pivots',{})[n]=[p.x,p.z,-p.y]   # Blender (x,y,z) -> glTF (x,z,-y)
if CFG.get('split_paint'):
  # Faces whose palette texel is the red livery become a separate untextured
  # 'paint' mesh, so the Hangar paint choice can recolour the fuselage.
  o=parts[CFG['split_paint']];img=None
  for m in o.data.materials:
    for nd in (m.node_tree.nodes if m and m.use_nodes else []):
      if nd.type=='TEX_IMAGE' and nd.image: img=nd.image
  W,H=img.size;px=list(img.pixels)
  bm=bmesh.new();bm.from_mesh(o.data);uv=bm.loops.layers.uv.active
  red=[]
  for f in bm.faces:
    u,v=f.loops[0][uv].uv;x=min(W-1,max(0,int(u%1*W)));y=min(H-1,max(0,int(v%1*H)));i=(y*W+x)*4
    r,g,b=px[i:i+3]
    if r>.55 and g<.3 and b<.3: red.append(f)
  pm=bpy.data.materials.new('Paint');pm.use_nodes=True
  bsdf=pm.node_tree.nodes.get('Principled BSDF');bsdf.inputs['Base Color'].default_value=(.8,.06,.05,1);bsdf.inputs['Roughness'].default_value=.45
  bm2=bm.copy();bmesh.ops.delete(bm2,geom=[f for f in bm2.faces if f.index not in {r.index for r in red}],context='FACES')
  bmesh.ops.delete(bm,geom=red,context='FACES')
  bm.to_mesh(o.data);bm.free()
  me=bpy.data.meshes.new('paint');bm2.to_mesh(me);bm2.free()
  for p in me.polygons: p.material_index=0
  me.materials.clear();me.materials.append(pm)
  po=bpy.data.objects.new('paint',me);sc.collection.objects.link(po);parts['paint']=po
for n,o in parts.items():
  bpy.context.view_layer.objects.active=o
  for x in bpy.context.view_layer.objects: x.select_set(x==o)
  bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.mesh.remove_doubles(threshold=1e-5);bpy.ops.object.mode_set(mode='OBJECT')
  t=sum(len(p.vertices)-2 for p in o.data.polygons)
  if t>CFG['tris']:
    m=o.modifiers.new('d','DECIMATE');m.ratio=CFG['tris']/t;bpy.ops.object.modifier_apply(modifier='d')
  vs=[v.co for v in o.data.vertices]
  info['parts'][n]={'tris':sum(len(p.vertices)-2 for p in o.data.polygons),'min':[min(v[i] for v in vs) for i in (0,2,1)],'max':[max(v[i] for v in vs) for i in (0,2,1)]}
  # Blender z/y swap: min/max y-index above is Blender z (up); glTF z = -Blender y
  info['parts'][n]['min'][2],info['parts'][n]['max'][2]=-info['parts'][n]['max'][2],-info['parts'][n]['min'][2]
# Drop unused PBR maps (normal/metal-rough/occlusion) and shrink colour maps.
for m in bpy.data.materials:
  if not m.use_nodes: continue
  nt=m.node_tree;bsdf=nt.nodes.get('Principled BSDF')
  if not bsdf: continue
  for inp in ('Normal','Metallic','Roughness','Emission Color','Specular IOR Level'):
    for l in list(bsdf.inputs[inp].links): nt.links.remove(l)
  bsdf.inputs['Metallic'].default_value=0;bsdf.inputs['Roughness'].default_value=.75
  # Keep only textures that still feed the shader (colour/alpha): orphaned
  # normal/occlusion maps would otherwise still be exported (or fail to save).
  live=set();todo=[n for n in nt.nodes if n.type in ('BSDF_PRINCIPLED','OUTPUT_MATERIAL')]
  while todo:
    n=todo.pop()
    if n in live: continue
    live.add(n);todo+=[l.from_node for i in n.inputs for l in i.links]
  for n in list(nt.nodes):
    if n.type=='TEX_IMAGE' and n not in live: nt.nodes.remove(n)
  for n in list(nt.nodes):
    if n.type=='GROUP' and 'gltf' in (n.node_tree.name if n.node_tree else '').lower(): nt.nodes.remove(n)
for im in list(bpy.data.images):
  if not im.users: bpy.data.images.remove(im);continue
  if im.size[0]>CFG['tex'] or im.size[1]>CFG['tex']:
    f=CFG['tex']/max(im.size);im.scale(max(1,int(im.size[0]*f)),max(1,int(im.size[1]*f)))
for x in bpy.context.view_layer.objects: x.select_set(x.name in parts)
os.makedirs(outdir,exist_ok=True)
bpy.ops.export_scene.gltf(filepath=f'{outdir}/{pid}.gltf',export_format='GLTF_SEPARATE',use_selection=True,
  export_image_format='WEBP',export_texture_dir=f'{pid}-tex',export_animations=False,export_skins=False,export_morph=False,export_apply=True)
# Sorted alpha blending flickers on instanced props: leaf/flower cards become
# alpha-tested cut-outs and solid bodies (CFG opaque) are forced opaque.
g=json.load(open(f'{outdir}/{pid}.gltf'))
for m in g.get('materials',[]):
  if m.get('name') in CFG.get('opaque',[]): m.pop('alphaMode',None);m.pop('alphaCutoff',None)
  elif m.get('alphaMode')=='BLEND': m['alphaMode']='MASK';m['alphaCutoff']=.5
json.dump(g,open(f'{outdir}/{pid}.gltf','w'),separators=(',',':'))
json.dump(info,open(f'{outdir}/{pid}.json','w'),indent=1)
print('##',json.dumps(info))
