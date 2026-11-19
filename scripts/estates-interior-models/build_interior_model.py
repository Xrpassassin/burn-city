# Blender headless: normalise a CC BY / CC0 Sketchfab furniture model into one small
# static glTF for the walk-in Estates home interiors (client/assets/estates-interiors/).
# usage: blender -b --python build_interior_model.py -- <id> <src.glb> <outdir> [preview.png]
# Output: glTF Y-up, metres, grounded at y=0, centred on x/z, front facing +Z,
# decimated to the budget below, colour maps only (WebP, <=256 px), plus <id>.json.
import bpy,bmesh,sys,json,math,mathutils,os
args=sys.argv[sys.argv.index('--')+1:]
pid,src,outdir=args[:3];preview=args[3] if len(args)>3 else None
# fit: ('len', metres) = longest horizontal side; ('h', metres) = height
CFG={
 'sofa':dict(rotz=0,fit=('len',1.9),tris=1500),
 'armchair':dict(rotz=0,fit=('h',.85),tris=400),
 'bed':dict(rotz=180,fit=('len',2.05),tris=1600),
 'bookshelf':dict(rotz=0,fit=('h',1.85),tris=1200),
 'kitchen':dict(rotz=-90,fit=('len',1.7),tris=1500),
 'fridge':dict(rotz=-90,fit=('h',1.8),tris=900),
 'monstera':dict(rotz=0,fit=('len',1.0),tris=1400),
 'snake':dict(rotz=0,fit=('h',.95),tris=1200),
 'tvstand':dict(rotz=0,fit=('len',1.5),tris=500),
 'dining':dict(rotz=0,fit=('len',1.75),tris=1500),
 'chandelier':dict(rotz=0,fit=('len',.9),tris=700),
}[pid]
ROT=json.loads(os.environ.get('ROTZ','{}'))
if pid in ROT: CFG['rotz']=ROT[pid]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
sc=bpy.context.scene
for o in bpy.data.objects:
  if o.animation_data: o.animation_data.action=None
meshes=[o for o in bpy.data.objects if o.type=='MESH']
dg=bpy.context.evaluated_depsgraph_get();bm=bmesh.new();mats=[]
for o in meshes:
  oe=o.evaluated_get(dg);me=bpy.data.meshes.new_from_object(oe,preserve_all_data_layers=True,depsgraph=dg)
  me.transform(oe.matrix_world);remap=[]
  for m in me.materials:
    if m not in mats: mats.append(m)
    remap.append(mats.index(m))
  for p in me.polygons: p.material_index=remap[p.material_index] if remap else 0
  bm.from_mesh(me)
me=bpy.data.meshes.new('body');bm.to_mesh(me);bm.free()
for m in mats: me.materials.append(m)
for o in list(bpy.data.objects): bpy.data.objects.remove(o,do_unlink=True)
body=bpy.data.objects.new('body',me);sc.collection.objects.link(body)
me.transform(mathutils.Matrix.Rotation(math.radians(CFG['rotz']),4,'Z'))
vs=[v.co for v in me.vertices]
mn=mathutils.Vector([min(v[i] for v in vs) for i in range(3)]);mx=mathutils.Vector([max(v[i] for v in vs) for i in range(3)])
kind,val=CFG['fit']
s=val/((mx.z-mn.z) if kind=='h' else max(mx.x-mn.x,mx.y-mn.y))
c=mathutils.Vector(((mn.x+mx.x)/2,(mn.y+mx.y)/2,mn.z))
me.transform(mathutils.Matrix.Scale(s,4)@mathutils.Matrix.Translation(-c))
bpy.context.view_layer.objects.active=body;body.select_set(True)
bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.mesh.remove_doubles(threshold=1e-5);bpy.ops.object.mode_set(mode='OBJECT')
t=sum(len(p.vertices)-2 for p in me.polygons)
if t>CFG['tris']:
  m=body.modifiers.new('d','DECIMATE');m.ratio=CFG['tris']/t;bpy.ops.object.modifier_apply(modifier='d')
vs=[v.co for v in me.vertices]
info={'id':pid,'source_scale':s,'tris':sum(len(p.vertices)-2 for p in me.polygons),
 'size':[max(v.x for v in vs)-min(v.x for v in vs),max(v.z for v in vs)-min(v.z for v in vs),max(v.y for v in vs)-min(v.y for v in vs)]}
for m in bpy.data.materials:
  if not m.use_nodes: continue
  nt=m.node_tree;bsdf=nt.nodes.get('Principled BSDF')
  if not bsdf: continue
  for inp in ('Normal','Metallic','Roughness'):
    for l in list(bsdf.inputs[inp].links): nt.links.remove(l)
  for l in list(bsdf.inputs['Base Color'].links):
    if l.from_node.type!='TEX_IMAGE': nt.links.remove(l)
  bsdf.inputs['Metallic'].default_value=0;bsdf.inputs['Roughness'].default_value=.78
  for nd in list(nt.nodes):
    if nd.type=='TEX_IMAGE' and not any(l.to_socket==bsdf.inputs['Base Color'] for l in nd.outputs[0].links): nt.nodes.remove(nd)
for im in list(bpy.data.images):
  if im.users==0: bpy.data.images.remove(im);continue
  if im.size[0]>256 or im.size[1]>256:
    f=256/max(im.size);im.scale(max(1,int(im.size[0]*f)),max(1,int(im.size[1]*f)))
os.makedirs(outdir,exist_ok=True)
bpy.ops.export_scene.gltf(filepath=f'{outdir}/{pid}.gltf',export_format='GLTF_SEPARATE',use_selection=True,
  export_image_format='WEBP',export_texture_dir=f'{pid}-tex',export_animations=False,export_skins=False,export_morph=False,export_apply=True)
json.dump(info,open(f'{outdir}/{pid}.json','w'),indent=1)
print('##',json.dumps(info))
if preview:
  cam=bpy.data.cameras.new('c');co=bpy.data.objects.new('c',cam);sc.collection.objects.link(co)
  h=info['size'][1];L=max(info['size'][0],info['size'][2])
  co.location=(L*.9,-max(L,h)*2.2,h*1.1);co.rotation_euler=(math.radians(75),0,math.radians(22));sc.camera=co
  sc.render.engine='BLENDER_WORKBENCH';sc.display.shading.color_type='TEXTURE';sc.display.shading.light='STUDIO'
  sc.render.resolution_x=sc.render.resolution_y=220;sc.render.filepath=preview
  bpy.ops.render.render(write_still=True)
