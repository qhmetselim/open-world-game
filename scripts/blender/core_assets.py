"""Core visual family. Author in runtime XYZ metres; p() maps to Blender Z-up.
No gameplay/collider changes. Run build.mjs or import build() via Blender MCP.
"""
import argparse
import math
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
import bpy
from mathutils import Vector


def p(v):
    return Vector((v[0], -v[2], v[1]))


def mat(name, color, metal=0, rough=.65, emission=0):
    m = bpy.data.materials.new('MAT_' + name)
    if m.node_tree is None:
        m.use_nodes = True
    s = m.node_tree.nodes.get('Principled BSDF')
    s.inputs['Base Color'].default_value = (*color, 1)
    s.inputs['Metallic'].default_value = metal
    s.inputs['Roughness'].default_value = rough
    s.inputs['Emission Color'].default_value = (*color, 1)
    s.inputs['Emission Strength'].default_value = emission
    return m


def finish(obj, name, material, bevel=0):
    obj.name = name
    obj.data.materials.append(material)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    if bevel:
        mod = obj.modifiers.new('Edge highlights', 'BEVEL')
        mod.width = bevel
        mod.segments = 1
        bpy.ops.object.modifier_apply(modifier=mod.name)
    return obj


def box(name, loc, size, material, bevel=0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=p(loc))
    obj = bpy.context.object
    obj.scale = (size[0], size[2], size[1])
    return finish(obj, name, material, bevel)


def rod(name, start, end, radius, material, sides=10, top=None):
    a, b = p(start), p(end)
    bpy.ops.mesh.primitive_cone_add(vertices=sides, radius1=radius, radius2=radius if top is None else top,
                                  depth=(b-a).length, location=(a+b)/2)
    obj = bpy.context.object
    obj.rotation_euler = (b-a).to_track_quat('Z', 'Y').to_euler()
    return finish(obj, name, material)


def mesh(name, vertices, faces, material):
    data = bpy.data.meshes.new('GEO_' + name)
    data.from_pydata([p(v) for v in vertices], [], faces)
    data.update()
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(material)
    # Outward normals for arbitrary authored polygons.
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.normals_make_consistent(inside=False)
    bpy.ops.object.mode_set(mode='OBJECT')
    return obj


def loft(name, stations, material):
    # z, half width, lower edge, upper edge; bevelled eight-sided body cross-section.
    verts = []
    for z, w, bottom, top in stations:
        verts += [(x, y, z) for x, y in [(-w*.88,bottom), (w*.88,bottom),
                  (w,bottom+.09), (w,top-.07), (w*.91,top), (-w*.91,top),
                  (-w,top-.07), (-w,bottom+.09)]]
    faces = [tuple(reversed(range(8))), tuple(range(len(verts)-8,len(verts)))]
    for i in range(len(stations)-1):
        for j in range(8):
            faces.append((i*8+j,i*8+(j+1)%8,(i+1)*8+(j+1)%8,(i+1)*8+j))
    return mesh(name, verts, faces, material)


def join(name):
    bpy.ops.object.select_all(action='DESELECT')
    objects = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    for o in objects:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.join()
    o = bpy.context.object
    o.name = name
    bpy.context.scene.cursor.location = (0,0,0)
    bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
    o['units'] = 'metres'
    o['visual_only'] = True
    if name in ('BODY_Sedan', 'BODY_Police', 'BODY_Hatchback', 'BODY_Crossover'):
        from vehicle_doors import split_doors
        split_doors(o, 1.09 if name == 'BODY_Crossover' else .80)
    return o


def sedan(police=False):
    paint = mat('PoliceIvory' if police else 'SedanPetrol', (.68,.73,.72) if police else (.055,.19,.23), .35, .38)
    dark = mat('Graphite', (.023,.031,.036), .18, .57)
    glass = mat('BlueGlass', (.035,.10,.14), .5, .24)
    silver = mat('SatinAlloy', (.37,.43,.45), .72, .34)
    lamp = mat('Headlamp', (.82,.86,.73), .1, .25, .25)
    red = mat('TailLamp', (.55,.026,.021), .1, .28, .2)
    body = loft('Coachwork', [(-2.1,.78,-.43,.14),(-1.91,.925,-.57,.28),
                 (-.8,.925,-.62,.35),(.7,.925,-.62,.35),(1.87,.89,-.54,.22),(2.1,.77,-.40,.13)], paint)
    # Real wheel-arch openings, not painted discs. Covers the suspension travel envelope.
    for z in [-1.25,1.25]:
        cutter = rod('ArchCutter',(-1.2,-.60,z),(1.2,-.60,z),.46,dark,20)
        bpy.context.view_layer.objects.active = body
        mod = body.modifiers.new('Wheel arch','BOOLEAN'); mod.operation='DIFFERENCE'; mod.object=cutter
        bpy.ops.object.modifier_apply(modifier=mod.name)
        bpy.data.objects.remove(cutter, do_unlink=True)
    # Cabin wedge: hood longer than deck; opaque inset glazing and visible pillars.
    mesh('Cabin', [(-.81,.31,-1.14),(.81,.31,-1.14),(.81,.31,.97),(-.81,.31,.97),
                  (-.65,.80,-.69),(.65,.80,-.69),(.65,.80,.43),(-.65,.80,.43)],
         [(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7),(4,5,6,7),(3,2,1,0)], paint)
    mesh('Windscreen',[(-.69,.38,.91),(.69,.38,.91),(.59,.75,.49),(-.59,.75,.49)],[(0,1,2,3)],glass)
    mesh('RearGlass',[(-.70,.38,-1.09),(-.59,.75,-.745),(.59,.75,-.745),(.70,.38,-1.09)],[(0,1,2,3)],glass)
    for side in [-1,1]:
        for za,zb,ta,tb in [(-1.02,-.18,-.67,-.18),(-.10,.85,-.10,.40)]:
            mesh('SideGlass',[(side*.791,.38,za),(side*.791,.38,zb),(side*.671,.75,tb),(side*.671,.75,ta)],[(0,1,2,3)],glass)
        box('DoorHandle',(side*.928,.20,-.36),(.026,.045,.19),silver,.012)
        box('FrontDoorHandle',(side*.928,.20,.03),(.026,.045,.15),silver,.012)
        box('Mirror',(side*1.005,.46,.60),(.19,.13,.23),paint,.035)
        box('MirrorLens',(side*1.008,.46,.477),(.14,.075,.014),glass)
        box('Rocker',(side*.86,-.56,0),(.07,.10,1.13),dark,.015)
    for z in [-2.06,2.06]:
        box('Bumper',(0,-.12,z),(1.55,.17,.10),dark,.03)
        box('NumberPlate',(0,-.075,z+(.057 if z>0 else -.057)),(.39,.12,.02),silver,.008)
    box('Grille',(0,.09,2.105),(.73,.13,.025),dark,.02)
    for side in [-1,1]:
        box('Headlamp',(side*.57,.115,2.069),(.36,.105,.065),lamp,.016)
        box('TailLamp',(side*.61,.12,-2.076),(.32,.115,.055),red,.015)
    if police:
        blue = mat('PoliceBlue', (.018,.07,.20), .28,.4)
        beacon = mat('BeaconBlue',(.015,.19,.85),.2,.25,.8)
        for side in [-1,1]:
            box('PoliceDoorPanel',(side*.93,.045,-.02),(.019,.23,1.05),blue)
            # Badge is a geometry motif; no texture dependencies.
            rod('PoliceShield',(side*.946,.045,-.08),(side*.965,.045,-.08),.085,silver,6)
            box('PoliceStripe',(side*.94,.205,-.06),(.016,.035,1.03),silver)
        box('LightbarMount',(0,.846,-.05),(1.15,.09,.27),dark,.025)
        box('BeaconRed',(-.36,.94,-.05),(.48,.12,.25),red,.025)
        box('BeaconBlue',(.36,.94,-.05),(.48,.12,.25),beacon,.025)
        box('BeaconDivider',(0,.94,-.05),(.18,.10,.25),silver,.02)
        for x in [-.47,.47]:
            box('PushBarUpright',(x,-.015,2.18),(.055,.35,.07),dark,.015)
        box('PushBar',(0,.11,2.19),(1.05,.055,.06),silver,.013)
        rod('Antenna',(.48,.40,-1.55),(.48,.96,-1.55),.012,dark,6)
    join('BODY_Police' if police else 'BODY_Sedan')


def wheel():
    rubber=mat('Rubber',(.018,.022,.024),0,.92)
    alloy=mat('SatinAlloy',(.37,.43,.45),.72,.34)
    dark=mat('WheelRecess',(.04,.052,.06),.3,.65)
    rod('Tire',(-.09,0,0),(.09,0,0),.36,rubber,16)
    for side in [-1,1]:
        rod('Rim',(side*.091,0,0),(side*.10,0,0),.255,alloy,16)
        rod('Recess',(side*.101,0,0),(side*.105,0,0),.212,dark,16)
        rod('Hub',(side*.106,0,0),(side*.12,0,0),.075,alloy,8)
        for j in range(5):
            a=j*math.tau/5
            spoke = rod('Spoke',(side*.112,.05*math.cos(a),.05*math.sin(a)),
                (side*.112,.23*math.cos(a),.23*math.sin(a)),.034,alloy,4)
            # Flatten alloy spokes along the axle; keep the original .18m tire width.
            spoke.scale.x = .28
    join('WHEEL_Sedan')


def pistol():
    steel=mat('PistolSteel',(.105,.13,.15),.6,.35)
    grip=mat('PistolGrip',(.026,.038,.037),0,.82)
    accent=mat('PistolDetail',(.32,.36,.34),.65,.42)
    # Runtime origin is bore mouth; weapon extends behind it (+Z), firing is -Z.
    box('Slide',(0,.012,.156),(.085,.096,.312),steel,.012)
    rod('Barrel',(0,0,-.004),(0,0,.04),.025,accent,12)
    rod('Bore',(0,0,-.006),(0,0,-.007),.014,grip,12)
    box('Frame',(0,-.058,.19),(.079,.065,.235),grip,.01)
    handle=box('Grip',(0,-.15,.255),(.075,.18,.099),grip,.013)
    handle.rotation_euler.x=math.radians(-12)
    box('MagazineHeel',(0,-.244,.277),(.085,.023,.11),steel,.006)
    for y,z,h,d in [(-.101,.11,.075,.017),(-.145,.167,.017,.13)]:
        box('TriggerGuard',(0,y,z),(.043,h,d),steel,.005)
    box('Trigger',(0,-.105,.19),(.013,.053,.016),accent,.003)
    for z in [.232,.250,.268,.286]:
        for x in [-.043,.043]:
            box('SlideSerration',(x,.016,z),(.003,.052,.006),grip)
    box('FrontSight',(0,.068,.034),(.012,.021,.019),accent)
    box('RearSight',(0,.068,.291),(.05,.018,.02),grip)
    join('WEAPON_Pistol')


def street(kind):
    metal=mat('StreetMetal',(.055,.095,.10),.35,.6)
    trim=mat('StreetTrim',(.31,.25,.16),.45,.6)
    wood=mat('StreetTimber',(.31,.17,.075),0,.78)
    if kind=='bench':
        for z in [-.23,-.075,.08,.235]:
            box('SeatSlat',(0,.52,z),(1.9,.07,.125),wood,.014)
        for y in [.79,.97,1.15]:
            box('BackSlat',(0,y,-.29),(1.9,.13,.065),wood,.014)
        for x in [-.68,.68]:
            for z in [-.22,.22]:
                box('Leg',(x,.255,z),(.075,.51,.085),metal,.013)
            box('SeatFrame',(x,.46,0),(.09,.075,.65),metal,.012)
            box('BackFrame',(x,.86,-.32),(.075,.69,.065),metal,.012)
            box('Arm',(x,.77,.015),(.085,.075,.54),metal,.017)
            rod('ArmSupport',(x,.53,.21),(x,.76,.21),.031,metal)
    elif kind=='bin':
        rod('Base',(0,0,0),(0,.07,0),.31,metal,12)
        rod('Body',(0,.07,0),(0,.91,0),.30,metal,12,top=.33)
        rod('Rim',(0,.86,0),(0,.93,0),.35,trim,12)
        box('Lid',(0,1.07,0),(.69,.09,.66),metal,.055)
        for x in [-.29,.29]:
            box('LidSupport',(x,.99,0),(.07,.14,.51),metal)
        for x in [-.19,0,.19]:
            rod('FrontRib',(x,.16,math.sqrt(.304**2-x*x)),
                (x,.78,math.sqrt(.326**2-x*x)),.016,trim,6)
    elif kind=='signal':
        # Housing origin at existing 3.2m pole centre, lenses remain state-driven runtime batches.
        box('Foot',(0,.09,0),(.38,.18,.38),metal,.035)
        rod('Pole',(0,.15,0),(0,3.2,0),.07,metal,10)
        box('Housing',(0,3.2,.035),(.50,1.19,.30),metal,.045)
        for y in [3.54,3.20,2.86]:
            # Open annulus, not a capped cylinder which would occlude the runtime lens.
            bpy.ops.mesh.primitive_torus_add(major_segments=12, minor_segments=4,
                major_radius=.146, minor_radius=.012, location=p((0,y,-.17)), rotation=(math.pi/2,0,0))
            finish(bpy.context.object,'Bezel',trim)
            # Three-sided sun visors, open face toward runtime -Z.
            box('Hood',(0,y+.155,-.23),(.34,.035,.25),metal,.009)
            for x in [-.154,.154]:
                box('HoodSide',(x,y+.052,-.23),(.032,.21,.25),metal,.007)
    join('PROP_'+kind.title())


def build(kind):
    # Called only in factory-startup headless or a dedicated MCP preview scene.
    bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
    bpy.context.scene.unit_settings.system='METRIC'
    bpy.context.scene.unit_settings.scale_length=1
    if kind in ['sedan','police']: sedan(kind=='police')
    elif kind=='wheel': wheel()
    elif kind=='pistol': pistol()
    else: street(kind)


def export(path):
    Path(path).parent.mkdir(parents=True,exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,
        export_yup=True,export_apply=True,export_extras=True,export_animations=False,
        export_cameras=False,export_lights=False,export_texcoords=False,export_normals=True)


if __name__=='__main__':
    parser=argparse.ArgumentParser(); parser.add_argument('--output',required=True)
    args=parser.parse_args(sys.argv[sys.argv.index('--')+1:])
    for kind in ['sedan','police','wheel','pistol','signal','bench','bin']:
        build(kind); export(Path(args.output)/(kind+'.glb'))
