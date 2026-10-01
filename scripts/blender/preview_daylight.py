"""MCP lighting/material review; copies the current preview, never edits GLBs.
Run after preview_vehicles.py or preview_characters.py. This is an art-direction
check, not a pixel-equivalent Three.js renderer (Cycles/AgX differ from ACES).
"""
import bpy
from mathutils import Vector

bpy.ops.scene.new(type='FULL_COPY')
scene = bpy.context.scene
scene.name = 'DaylightMaterialReview'
for obj in list(scene.objects):
    if obj.type == 'LIGHT':
        bpy.data.objects.remove(obj, do_unlink=True)
light = bpy.data.lights.new('DaylightSun', 'SUN')
light.energy = 3.2
light.color = (1.0, .90, .76)
light.angle = .035
sun = bpy.data.objects.new('DaylightSun', light)
scene.collection.objects.link(sun)
# Three.js Y-up (-65,95,45) -> Blender Z-up (-65,-45,95).
sun.rotation_euler = (-Vector((-65, -45, 95))).to_track_quat('-Z', 'Y').to_euler()
scene.world = bpy.data.worlds.new('DaylightFill')
scene.world.use_nodes = True
background = scene.world.node_tree.nodes['Background']
background.inputs['Color'].default_value = (.55, .68, .80, 1)
background.inputs['Strength'].default_value = .45
scene.render.engine = 'CYCLES'
scene.cycles.samples = 24
scene.view_settings.view_transform = 'AgX'
scene.render.resolution_x = 1400
scene.render.resolution_y = 800
scene.render.resolution_percentage = 100
scene.render.filepath = '/tmp/stage24-blender-daylight.png'
__result__ = {'scene': scene.name, 'output': scene.render.filepath}
