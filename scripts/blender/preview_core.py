"""Run via Blender MCP script_path; creates a separate scene, preserves user scenes.
args: {kind: sedan|police|pistol|signal|bench|bin, output: /absolute/preview.png}
"""
import importlib.util
from pathlib import Path
import bpy
from mathutils import Vector

options=globals().get('args',{})
source=Path(options['source']) if 'source' in options else Path(__file__).with_name('core_assets.py')
spec=importlib.util.spec_from_file_location('core_assets',source)
core=importlib.util.module_from_spec(spec); spec.loader.exec_module(core)
kind=options.get('kind','sedan')
scene=bpy.data.scenes.new('CoreAssetReview_'+kind)
bpy.context.window.scene=scene
core.build(kind)
body=bpy.context.object
if kind in ['sedan','police']:
    wheel_scene=bpy.data.scenes.new('CoreWheelReview')
    bpy.context.window.scene=wheel_scene
    core.build('wheel')
    template=bpy.context.object
    for x,z in [(-.75,1.25),(.75,1.25),(-.75,-1.25),(.75,-1.25)]:
        obj=template.copy(); obj.data=template.data
        # Measured flat-ground Rapier resting suspension = .29376m (not full droop .38m).
        obj.location=core.p((x,-.61876,z)); scene.collection.objects.link(obj)
    bpy.context.window.scene=scene
floor_height=-.97876 if kind in ['sedan','police'] else -.27 if kind=='pistol' else 0
floor=core.mat('PreviewFloor',(.12,.16,.17),0,.9)
core.box('PreviewFloor',(0,floor_height-.04,0),(200,.08,200),floor)
scene.world=bpy.data.worlds.new('CoreReviewWorld'); scene.world.use_nodes=True
scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.32,.40,.47,1)
scene.world.node_tree.nodes['Background'].inputs[1].default_value=.45
size=.5 if kind=='pistol' else 5 if kind in ['sedan','police'] else 4.5 if kind=='signal' else 2.5
target=core.p((0,.05,.1) if kind in ['sedan','police'] else (0,-.08,.15) if kind=='pistol' else (0,1.7,0) if kind=='signal' else (0,.55,0))
for name,location,power,area in [('Key',(3,-4,7),1000,5),('Fill',(-4,-1,3),700,5),('Rim',(1,5,5),1200,4)]:
    light=bpy.data.lights.new(name,'AREA'); light.energy=power; light.shape='DISK'; light.size=area
    obj=bpy.data.objects.new(name,light); scene.collection.objects.link(obj); obj.location=location
    obj.rotation_euler=(target-obj.location).to_track_quat('-Z','Y').to_euler()
camera=bpy.data.cameras.new('AssetCamera'); obj=bpy.data.objects.new('AssetCamera',camera); scene.collection.objects.link(obj)
obj.location=target+Vector((size*1.1,size*1.5 if kind in ['signal','pistol'] else -size*1.5,size*.8)); obj.rotation_euler=(target-obj.location).to_track_quat('-Z','Y').to_euler()
camera.type='ORTHO'; camera.ortho_scale=size*1.25; scene.camera=obj
scene.render.engine='CYCLES'; scene.cycles.samples=24
scene.render.resolution_x=1100; scene.render.resolution_y=800; scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG'; scene.render.filepath=options.get('output','/tmp/core-asset-preview.png')
scene.view_settings.view_transform='AgX'
__result__={'scene':scene.name,'kind':kind,'mesh_objects':len([o for o in scene.objects if o.type=='MESH']),'output':scene.render.filepath}
