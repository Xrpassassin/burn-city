"""Render a repeatable four-view QA contact sheet of a collection base GLB.

Run: blender -b --python tools/blender/nft_avatar_base_preview.py -- input.glb output.png
Requires Blender and its glTF importer. Uses neutral studio lighting and orthographic
cameras to expose silhouette, clipping, and facial readability. Does not approve art.
"""
import bpy
import math
import os
import sys
from mathutils import Vector

def main():
    args=sys.argv[sys.argv.index("--")+1:] if "--" in sys.argv else []
    if len(args)!=2:
        raise SystemExit("Usage: blender -b --python nft_avatar_base_preview.py -- input.glb output.png")
    source,destination=map(os.path.abspath,args)
    if not os.path.isfile(source) or not source.lower().endswith(".glb"):
        raise SystemExit("Input must be an existing GLB")
    if not destination.lower().endswith(".png"):
        raise SystemExit("Output must be a PNG")
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    bpy.ops.import_scene.gltf(filepath=source)
    meshes=[obj for obj in bpy.context.scene.objects if obj.type=="MESH"]
    if not meshes:
        raise SystemExit("Imported GLB has no mesh")
    points=[]
    for obj in meshes:
        for corner in obj.bound_box:
            points.append(obj.matrix_world @ Vector(corner))
    low=Vector(tuple(min(p[i] for p in points) for i in range(3)))
    high=Vector(tuple(max(p[i] for p in points) for i in range(3)))
    center=(low+high)*.5
    extent=max((high-low).x,(high-low).y,(high-low).z,.1)
    world=bpy.context.scene.world
    world.color=(.14,.14,.14)
    def area(name,loc,power,size):
        data=bpy.data.lights.new(name,"AREA")
        data.energy=power
        data.shape="DISK"
        data.size=size
        obj=bpy.data.objects.new(name,data)
        bpy.context.collection.objects.link(obj)
        obj.location=loc
        obj.rotation_euler=(center-obj.location).to_track_quat("-Z","Y").to_euler()
    area("Key",(center.x-3,center.y-4,center.z+4),650,4)
    area("Fill",(center.x+3,center.y-1,center.z+2),350,3)
    area("Rim",(center.x+1,center.y+3,center.z+3),750,3)
    scene=bpy.context.scene
    scene.render.engine="BLENDER_EEVEE_NEXT" if hasattr(scene,"eevee") else "BLENDER_EEVEE"
    scene.render.resolution_x=512
    scene.render.resolution_y=512
    scene.render.resolution_percentage=100
    scene.render.image_settings.file_format="PNG"
    scene.render.film_transparent=False
    camera_data=bpy.data.cameras.new("QA_Ortho")
    camera_data.type="ORTHO"
    camera_data.ortho_scale=extent*1.32
    camera=bpy.data.objects.new("QA_Ortho",camera_data)
    bpy.context.collection.objects.link(camera)
    scene.camera=camera
    # Model faces -Y. Four diagnostic views: front, 3/4, side, rear.
    directions=[(0,-1,0),(1,-1,0),(1,0,0),(0,1,0)]
    from pathlib import Path
    from tempfile import TemporaryDirectory
    from PIL import Image,ImageDraw
    with TemporaryDirectory() as temp:
        images=[]
        for idx,(x,y,z) in enumerate(directions):
            direction=Vector((x,y,z)).normalized()
            camera.location=center+direction*max(extent*2,3)
            camera.rotation_euler=(center-camera.location).to_track_quat("-Z","Y").to_euler()
            scene.render.filepath=os.path.join(temp,str(idx)+".png")
            bpy.ops.render.render(write_still=True)
            images.append(Image.open(scene.render.filepath).convert("RGB"))
        sheet=Image.new("RGB",(1024,1024),(35,35,35))
        draw=ImageDraw.Draw(sheet)
        for i,(label,im) in enumerate(zip(["FRONT","THREE-QUARTER","SIDE","REAR"],images)):
            x=(i%2)*512
            y=(i//2)*512
            sheet.paste(im,(x,y))
            draw.rectangle((x+8,y+8,x+158,y+36),fill=(20,20,20))
            draw.text((x+16,y+16),label,fill=(255,255,255))
        os.makedirs(os.path.dirname(destination),exist_ok=True)
        sheet.save(destination)
    print("QA preview saved:",destination,"(not a runtime approval)")

if __name__=="__main__":
    main()
