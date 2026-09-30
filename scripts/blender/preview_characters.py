"""MCP live review, preserves user's existing scenes. args.source = characters.py."""
import importlib.util
import sys
from pathlib import Path
import bpy
from mathutils import Vector
source=Path(args['source']); sys.path.insert(0,str(source.parent))
spec=importlib.util.spec_from_file_location('characters',source)
human=importlib.util.module_from_spec(spec); spec.loader.exec_module(human)
from core_assets import box, mat, p
scene=bpy.data.scenes.new('CharacterFamilyReview'); bpy.context.window.scene=scene
human.build()
templates={o.name:o for o in scene.objects if o.type=='EMPTY'}
def instance(name,location):
    root=templates[name].copy(); scene.collection.objects.link(root); root.location=p(location)
    for child in templates[name].children:
        copy=child.copy(); scene.collection.objects.link(copy); copy.parent=root
    return root
for index,x in enumerate([-2.2,-.75,.75,2.2]):
    style=[1,0,2,3][index]
    instance('torso'+str(style),(x,1.50,0))
    instance('head',(x,1.645,0))
    instance('cap' if style==3 else 'hair'+str(index%3),(x,1.645,0))
    for side in [-1,1]:
        instance('upperArm',(x+side*.295,1.51,0))
        instance('forearm',(x+side*.295,1.21,0))
        instance('leg'+str(index%2),(x+side*.113,.94,0))
for root in templates.values():
    for child in list(root.children): bpy.data.objects.remove(child,do_unlink=True)
    bpy.data.objects.remove(root,do_unlink=True)
box('Ground',(0,-.04,0),(200,.08,200),mat('StudioFloor',(.14,.19,.19)))
scene.world=bpy.data.worlds.new('CharacterReviewWorld'); scene.world.use_nodes=True
scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.5,.6,.66,1)
scene.world.node_tree.nodes['Background'].inputs[1].default_value=.6
for name,loc,energy,size in [('Key',(-3,6,6),750,5),('Rim',(4,4,-3),500,3)]:
    data=bpy.data.lights.new(name,'AREA'); data.energy=energy; data.shape='DISK'; data.size=size
    obj=bpy.data.objects.new(name,data); scene.collection.objects.link(obj); obj.location=p(loc)
    obj.rotation_euler=(p((0,1,0))-obj.location).to_track_quat('-Z','Y').to_euler()
data=bpy.data.cameras.new('CharacterReviewCamera'); obj=bpy.data.objects.new('CharacterReviewCamera',data); scene.collection.objects.link(obj)
obj.location=p((3.1,2.7,8)); obj.rotation_euler=(p((0,1,0))-obj.location).to_track_quat('-Z','Y').to_euler()
data.type='ORTHO'; data.ortho_scale=6.7; scene.camera=obj
scene.render.engine='CYCLES'; scene.cycles.samples=24
scene.render.resolution_x=1400; scene.render.resolution_y=850; scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG'; scene.render.filepath='/tmp/stage22-blender-characters.png'
scene.view_settings.view_transform='AgX'
__result__={'scene':scene.name,'output':scene.render.filepath}
