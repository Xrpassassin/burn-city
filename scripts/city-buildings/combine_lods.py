import bpy,sys
a,b,out=sys.argv[-3:]
bpy.ops.wm.read_factory_settings(use_empty=True)
def imp(f,name):
  before=set(bpy.data.objects);bpy.ops.import_scene.gltf(filepath=f)
  new=[o for o in bpy.data.objects if o not in before];ms=[o for o in new if o.type=='MESH']
  for o in new:
    if o.type!='MESH':bpy.data.objects.remove(o,do_unlink=True)
  for o in ms: o.data.transform(o.matrix_world);o.parent=None;o.matrix_world.identity()
  bpy.ops.object.select_all(action='DESELECT')
  for o in ms:o.select_set(True)
  bpy.context.view_layer.objects.active=ms[0]
  if len(ms)>1:bpy.ops.object.join()
  o=bpy.context.view_layer.objects.active;o.name=name;return o
o0=imp(a,'lod0');m0=o0.data.materials[0]
o1=imp(b,'lod1');o1.data.materials.clear();o1.data.materials.append(m0)
for m in list(bpy.data.materials):
  if m!=m0 and m.users==0:bpy.data.materials.remove(m)
for i in list(bpy.data.images):
  if i.users==0:bpy.data.images.remove(i)
m0.name='building'
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=out,export_format='GLTF_SEPARATE',export_texture_dir=sys.argv[-1].rsplit('/',1)[1].replace('.gltf','-tex'),use_selection=True,export_image_format='JPEG',export_jpeg_quality=82,export_yup=True)
print('IMGS',[i.name for i in bpy.data.images])
