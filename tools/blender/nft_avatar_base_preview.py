"""Render four repeatable QA views of a collection base GLB.

Run: blender -b --python tools/blender/nft_avatar_base_preview.py -- input.glb output.png
Requires Blender and its glTF importer. Uses neutral studio lighting and orthographic
cameras to expose silhouette, clipping, and facial readability. Does not approve art.
"""
import bpy
import json
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
    available={item.identifier for item in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items}\n    scene.render.engine="BLENDER_EEVEE_NEXT" if "BLENDER_EEVEE_NEXT" in available else ("BLENDER_EEVEE" if "BLENDER_EEVEE" in available else "BLENDER_WORKBENCH")
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
    root,_=os.path.splitext(destination)
    os.makedirs(os.path.dirname(destination),exist_ok=True)
    outputs={}\n    for label,(x,y,z) in zip(["front","three-quarter","side","rear"],directions):
        direction=Vector((x,y,z)).normalized()
        camera.location=center+direction*max(extent*2,3)
        camera.rotation_euler=(center-camera.location).to_track_quat("-Z","Y").to_euler()
        scene.render.filepath=root+"-"+label+".png"
        bpy.ops.render.render(write_still=True)\n        if not os.path.isfile(scene.render.filepath) or os.path.getsize(scene.render.filepath)==0:\n            raise RuntimeError("Preview missing: "+scene.render.filepath)\n        outputs[label]=scene.render.filepath\n    manifest={"source":source,"views":outputs,"meshCount":len(meshes),"bounds":{"min":list(low),"max":list(high)},"runtimeApproved":False}\n    with open(root+"-qa.json","w",encoding="utf8") as output:\n        json.dump(manifest,output,indent=2)\n    print("Four QA previews and manifest saved with prefix:",root,"(not a runtime approval)")

if __name__=="__main__":
    main()
