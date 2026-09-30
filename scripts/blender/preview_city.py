"""Live MCP review; args.source points to city_assets.py. Preserves existing scenes."""
import importlib.util
from pathlib import Path
import sys
import bpy
from mathutils import Vector

options=globals().get('args',{})
source=Path(options['source'])
sys.path.insert(0,str(source.parent))
spec=importlib.util.spec_from_file_location('city_assets',source)
city=importlib.util.module_from_spec(spec); spec.loader.exec_module(city)
from core_assets import box, mat, p

scene=bpy.data.scenes.new('CityModuleReview')
templates={}
for kind in city.KINDS:
    temporary=bpy.data.scenes.new('Module_'+kind); bpy.context.window.scene=temporary
    city.build(kind); templates[kind]=bpy.context.object
bpy.context.window.scene=scene
def module(kind,loc,scale=(1,1,1)):
    obj=templates[kind].copy(); obj.data=templates[kind].data; scene.collection.objects.link(obj)
    obj.location=p(loc); obj.scale=(scale[0],scale[2],scale[1]); return obj
trim=mat('Review_Trim',(.62,.57,.45)); roof=mat('Review_Roof',(.13,.20,.21))
for index,x in enumerate([-11,0,11]):
    floors=[4,2,5][index]; h=floors*3
    wall=mat('Review_Facade'+str(index),[(.58,.39,.29),(.58,.62,.53),(.69,.62,.48)][index])
    box('Building',(x,h/2,0),(8,h,6),wall)
    box('Cornice',(x,h+.12,0),(8.4,.24,6.4),trim)
    for y in [3,h-.12]: box('Band',(x,y,-3.08),(8.3,.18,.26),trim)
    for floor in range(floors):
        for column in range(3):
            dx=(column-1)*2.5
            if floor==0 and column==1: continue
            module('facade-window',(x+dx,floor*3+1.6,-3.06),(1.4,1.45,1))
            if index!=1 and floor>0 and floor%2==1 and column!=1:
                module('balcony',(x+dx,floor*3+.65,-3.05),(1.9,1,1))
    box('Entry',(x,1.35,-3.03),(1.7,2.7,.06),roof)
    if index>0:
        for dx in [-2.5,2.5]: module('awning',(x+dx,2.9,-3.08),(2.2,1,1))
        module('entry-sign',(x,3.4,-3.1),(3,1,1))
    else: module('awning',(x,3.1,-3.06),(2,.65,.65))
    module('roof-unit',(x+2,h+.25,1),(1.7,1.3,1.5))
    for dx in [-3.3,3.3]: module('planter',(x+dx,0,-3.5))
module('tree-broad',(-17,0,0)); module('tree-column',(17,0,0)); module('bush',(17,0,-3))
floor=mat('Review_Paving',(.25,.29,.27)); box('Ground',(0,-.08,0),(100,.16,100),floor)
scene.world=bpy.data.worlds.new('CityReviewWorld'); scene.world.use_nodes=True
scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.45,.55,.63,1)
scene.world.node_tree.nodes['Background'].inputs[1].default_value=.5
light=bpy.data.lights.new('CitySun','AREA'); light.energy=6000; light.size=15
obj=bpy.data.objects.new('CitySun',light); scene.collection.objects.link(obj); obj.location=(5,10,25)
obj.rotation_euler=(p((0,4,0))-obj.location).to_track_quat('-Z','Y').to_euler()
camera=bpy.data.cameras.new('CityReviewCamera'); obj=bpy.data.objects.new('CityReviewCamera',camera); scene.collection.objects.link(obj)
obj.location=p((24,19,-33)); obj.rotation_euler=(p((0,6,0))-obj.location).to_track_quat('-Z','Y').to_euler()
camera.type='ORTHO'; camera.ortho_scale=40; scene.camera=obj
scene.render.engine='CYCLES'; scene.cycles.samples=24
scene.render.resolution_x=1400; scene.render.resolution_y=900; scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG'; scene.render.filepath='/tmp/stage21-blender-city.png'
scene.view_settings.view_transform='AgX'
__result__={'scene':scene.name,'models':list(templates),'output':scene.render.filepath}
