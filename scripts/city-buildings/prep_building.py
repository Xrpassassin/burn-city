# Blender: join a Sketchfab building into one mesh, ground it (min z=0), centre it, preview render, export GLB with resized textures.
import bpy,sys,json,math,mathutils
src,out,png,tex=sys.argv[-4:];tex=int(tex)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
ms=[o for o in bpy.data.objects if o.type=='MESH']
for o in bpy.data.objects: o.select_set(False)
# apply world transforms
for o in ms:
  o.data=o.data.copy(); o.data.transform(o.matrix_world); o.parent=None; o.matrix_world=mathutils.Matrix()
for o in [o for o in bpy.data.objects if o.type!='MESH']: bpy.data.objects.remove(o,do_unlink=True)
bpy.context.view_layer.objects.active=ms[0]
for o in ms:o.select_set(True)
bpy.ops.object.join(); ob=bpy.context.view_layer.objects.active
me=ob.data
xs=[v.co.x for v in me.vertices];ys=[v.co.y for v in me.vertices];zs=[v.co.z for v in me.vertices]
cx=(min(xs)+max(xs))/2;cy=(min(ys)+max(ys))/2;z0=min(zs)
me.transform(mathutils.Matrix.Translation((-cx,-cy,-z0)))
# upside-down check: footprint area in lowest 10% vs top 10%
H=max(zs)-z0
def spread(lo,hi):
  pts=[(v.co.x,v.co.y) for v in me.vertices if lo<=v.co.z<=hi]
  if not pts:return 0
  return (max(p[0] for p in pts)-min(p[0] for p in pts))*(max(p[1] for p in pts)-min(p[1] for p in pts))
bot,top=spread(0,H*.1),spread(H*.9,H)
for im in bpy.data.images:
  if im.size[0]>tex: im.scale(tex,tex)
tris=sum(len(p.vertices)-2 for p in me.polygons)
print('RESULT',json.dumps(dict(tris=tris,size=[max(xs)-min(xs),max(ys)-min(ys),H],bot=bot,top=top,imgs=[(i.name,list(i.size)) for i in bpy.data.images],
  texroles=[(n.name,n.image.name if getattr(n,'image',None) else None,[l.to_socket.name for l in n.outputs[0].links]) for m in bpy.data.materials if m.node_tree for n in m.node_tree.nodes if n.type=='TEX_IMAGE'])))
bpy.ops.export_scene.gltf(filepath=out,export_format='GLB',use_selection=True,export_image_format='JPEG',export_jpeg_quality=85,export_yup=True,export_apply=True)
# preview
sc=bpy.context.scene;sc.render.engine='CYCLES';sc.cycles.samples=12;sc.cycles.device='CPU';sc.render.resolution_x=360;sc.render.resolution_y=480
w=bpy.data.worlds.new('w');sc.world=w;w.use_nodes=True;w.node_tree.nodes['Background'].inputs[1].default_value=1.2
L=bpy.data.lights.new('s','SUN');L.energy=4;lo=bpy.data.objects.new('s',L);lo.rotation_euler=(.8,.2,.6);sc.collection.objects.link(lo)
cam=bpy.data.cameras.new('c');co=bpy.data.objects.new('c',cam);sc.collection.objects.link(co);sc.camera=co
R=max(H,max(xs)-min(xs),max(ys)-min(ys))
co.location=(R*1.3,-R*1.5,H*.55+R*.35);d=mathutils.Vector((0,0,H*.45))-co.location;co.rotation_euler=d.to_track_quat('-Z','Y').to_euler()
sc.render.filepath=png;bpy.ops.render.render(write_still=True)
