"""Live MCP family review in a new scene; args.source points to vehicle_family.py."""
import importlib.util
import sys
from pathlib import Path
import bpy
source=Path(args['source']);sys.path.insert(0,str(source.parent))
spec=importlib.util.spec_from_file_location('family',source);family=importlib.util.module_from_spec(spec);spec.loader.exec_module(family)
import core_assets as core
scene=bpy.data.scenes.new('VehicleFamilyReview')
for index,kind in enumerate(['hatchback','sedan','crossover','police']):
    temporary=bpy.data.scenes.new('VehicleTemplate_'+kind);bpy.context.window.scene=temporary
    if kind in ['sedan','police']:core.build(kind)
    else:family.build(kind)
    body=bpy.context.object;copy=body.copy();copy.data=body.data;scene.collection.objects.link(copy);copy.location=core.p(((index-1.5)*3.3,0,0))
temporary=bpy.data.scenes.new('WheelTemplate');bpy.context.window.scene=temporary;core.build('wheel');wheel=bpy.context.object
for index in range(4):
    for x,z in [(-.75,1.25),(.75,1.25),(-.75,-1.25),(.75,-1.25)]:
        copy=wheel.copy();copy.data=wheel.data;scene.collection.objects.link(copy);copy.location=core.p(((index-1.5)*3.3+x,-.61876,z))
bpy.context.window.scene=scene
core.box('Ground',(0,-1.02,0),(100,.08248,100),core.mat('ReviewFloor',(.13,.18,.19)))
scene.world=bpy.data.worlds.new('VehicleReviewWorld');scene.world.use_nodes=True
scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.45,.55,.62,1)
scene.world.node_tree.nodes['Background'].inputs[1].default_value=.6
for name,loc,energy,size in [('Key',(-5,9,8),2200,7),('Rim',(5,7,-4),1800,5)]:
    data=bpy.data.lights.new(name,'AREA');data.energy=energy;data.size=size
    obj=bpy.data.objects.new(name,data);scene.collection.objects.link(obj);obj.location=core.p(loc);obj.rotation_euler=(-obj.location).to_track_quat('-Z','Y').to_euler()
data=bpy.data.cameras.new('FamilyCamera');obj=bpy.data.objects.new('FamilyCamera',data);scene.collection.objects.link(obj)
obj.location=core.p((10,7,14));obj.rotation_euler=(-obj.location).to_track_quat('-Z','Y').to_euler();data.type='ORTHO';data.ortho_scale=16;scene.camera=obj
scene.render.engine='CYCLES';scene.cycles.samples=24;scene.render.resolution_x=1600;scene.render.resolution_y=900;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.render.filepath='/tmp/stage23-blender-family.png';scene.view_settings.view_transform='AgX'
__result__={'scene':scene.name,'output':scene.render.filepath}
