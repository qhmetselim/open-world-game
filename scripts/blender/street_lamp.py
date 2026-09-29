"""Deterministic source asset. Blender Z-up metres -> exporter-managed glTF Y-up.
Run via `npm run assets:build`; no add-ons, textures, or external models.
"""
import argparse
import sys
from pathlib import Path

import bpy
from mathutils import Vector


def material(name, rgb, metallic=0.0, roughness=0.7, emission=0.0):
    mat = bpy.data.materials.new(name)
    if mat.node_tree is None:
        mat.use_nodes = True
    shader = mat.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (*rgb, 1)
    shader.inputs["Metallic"].default_value = metallic
    shader.inputs["Roughness"].default_value = roughness
    shader.inputs["Emission Color"].default_value = (*rgb, 1)
    shader.inputs["Emission Strength"].default_value = emission
    return mat


def finish(obj, name, mat):
    obj.name = name
    obj.data.materials.append(mat)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    return obj


def box(name, position, size, mat):
    bpy.ops.mesh.primitive_cube_add(size=1, location=position)
    obj = bpy.context.object
    obj.scale = size
    return finish(obj, name, mat)


def pole(name, start, end, radius, mat, top_radius=None):
    a, b = Vector(start), Vector(end)
    bpy.ops.mesh.primitive_cone_add(vertices=8, radius1=radius,
                                    radius2=radius if top_radius is None else top_radius,
                                    depth=(b-a).length, location=(a+b)/2)
    obj = bpy.context.object
    obj.rotation_euler = (b-a).to_track_quat('Z', 'Y').to_euler()
    return finish(obj, name, mat)


def build():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    scene = bpy.context.scene
    scene.unit_settings.system = 'METRIC'
    scene.unit_settings.scale_length = 1.0
    # Colours are linear values corresponding to the project's muted metal palette.
    metal = material('MAT_StreetLamp_Metal', (0.068, 0.117, 0.125), 0.35, 0.58)
    trim = material('MAT_StreetLamp_Trim', (0.39, 0.29, 0.16), 0.45, 0.6)
    lens = material('MAT_StreetLamp_Lens', (0.74, 0.69, 0.46), 0, 0.35, 0.35)
    box('FootPlate', (0, 0, 0.09), (0.52, 0.52, 0.18), metal)
    pole('Plinth', (0, 0, 0.18), (0, 0, 0.65), 0.19, metal, 0.13)
    pole('Mast', (0, 0, 0.55), (0, 0, 4.6), 0.105, metal, 0.075)
    pole('BaseBand', (0, 0, 0.63), (0, 0, 0.71), 0.14, trim)
    pole('UpperBand', (0, 0, 4.15), (0, 0, 4.25), 0.11, trim)
    # Blender -Y becomes runtime +Z: the lamp arm is the model's forward direction.
    pole('Arm', (0, 0, 4.45), (0, -1.12, 4.75), 0.075, metal)
    pole('Brace', (0, 0, 3.9), (0, -0.65, 4.61), 0.036, trim)
    box('Housing', (0, -1.15, 4.74), (0.48, 0.82, 0.20), metal)
    box('Lens', (0, -1.15, 4.625), (0.38, 0.68, 0.04), lens)
    box('Crown', (0, -1.15, 4.865), (0.35, 0.66, 0.05), metal)
    # One mesh / three material primitives, applied transforms and foot-centred pivot.
    bpy.ops.object.select_all(action='SELECT')
    bpy.context.view_layer.objects.active = bpy.data.objects['Mast']
    bpy.ops.object.join()
    root = bpy.context.object
    root.name = 'PROP_StreetLamp_Test'
    root.data.name = 'GEO_StreetLamp_Test'
    scene.cursor.location = (0, 0, 0)
    bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
    root['asset_id'] = 'props/street-lamp-test'
    root['units'] = 'metres'
    root['pivot'] = 'foot-centre'
    root['runtime_forward'] = '+Z'
    root['visual_only'] = True


args = argparse.ArgumentParser()
args.add_argument('--output', required=True)
options = args.parse_args(sys.argv[sys.argv.index('--')+1:])
build()
output = Path(options.output).resolve()
output.parent.mkdir(parents=True, exist_ok=True)
bpy.ops.export_scene.gltf(filepath=str(output), export_format='GLB',
                          use_selection=True, export_yup=True, export_apply=True,
                          export_extras=True, export_animations=False,
                          export_cameras=False, export_lights=False,
                          export_texcoords=False, export_normals=True,
                          export_materials='EXPORT')
print(f'EXPORTED {output} ({output.stat().st_size} bytes)')
