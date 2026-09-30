"""Reusable city modules, metres / runtime -Z facade front. No whole-building GLBs.
Window: unit width/height, facade plane Z=0. Vegetation/props: foot origin.
"""
import argparse
import sys
from pathlib import Path
import bpy
sys.path.insert(0, str(Path(__file__).resolve().parent))
from core_assets import box, rod, mat, finish, join, export, p

KINDS = ['facade-window', 'balcony', 'awning', 'entry-sign', 'planter', 'roof-unit', 'tree-broad', 'tree-column', 'bush', 'utility-box']

def foliage(name, location, size, material):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=1, location=p(location))
    obj = bpy.context.object
    obj.scale = (size[0], size[2], size[1])
    return finish(obj, name, material)

def build(kind):
    bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
    bpy.context.scene.unit_settings.system='METRIC'
    bpy.context.scene.unit_settings.scale_length=1
    stone=mat('City_Limestone',(.62,.57,.45),0,.85)
    frame=mat('City_Charcoal',(.075,.12,.13),.25,.6)
    glass=mat('City_Glass',(.17,.32,.37),.1,.35)
    sky=mat('City_GlassReflection',(.36,.52,.55),.1,.4)
    accent=mat('City_Patina',(.16,.32,.30),.15,.75)
    bark=mat('City_Bark',(.25,.18,.12),0,.95)
    leaf=mat('City_Foliage',(.18,.32,.21),0,.95)
    light=mat('City_FoliageLight',(.30,.43,.24),0,.95)
    if kind=='facade-window':
        # Glass in front of solid exterior shell, frame projects beyond it; no z fighting.
        box('Glass',(0,0,-.035),(.88,.87,.04),glass)
        box('SkyPane',(0,.19,-.058),(.82,.38,.008),sky)
        for x in [-.47,.47]: box('Jamb',(x,0,-.075),(.06,1,.15),stone)
        for y in [-.47,.47]: box('HeaderSill',(0,y,-.105),(1,.06,.20),stone)
        box('Mullion',(0,0,-.08),(.035,.89,.08),frame)
        box('Transom',(0,-.12,-.08),(.91,.028,.08),frame)
        box('DripSill',(0,-.52,-.15),(1.08,.055,.28),stone)
    elif kind=='balcony':
        box('Slab',(0,0,-.28),(1,.10,.60),stone)
        for x in [-.47,.47]: box('RailPost',(x,.40,-.55),(.045,.80,.045),frame)
        for y in [.12,.78]: box('Rail',(0,y,-.55),(1,.04,.04),frame)
        for x in [-.28,0,.28]: box('Baluster',(x,.45,-.55),(.023,.65,.025),frame)
        for x in [-.47,.47]: box('SideRail',(x,.78,-.28),(.04,.04,.56),frame)
    elif kind=='awning':
        canopy=box('Canopy',(0,-.10,-.37),(1,.08,.80),accent)
        canopy.rotation_euler.x=.15
        box('Valance',(0,-.23,-.73),(1,.20,.055),accent)
        for x in [-.44,.44]: rod('Bracket',(x,-.4,0),(x,-.20,-.65),.022,frame,6)
        box('EdgePiping',(0,-.31,-.74),(1,.035,.06),stone)
    elif kind=='entry-sign':
        box('SignFrame',(0,0,-.075),(1,.32,.15),frame,.02)
        box('SignFace',(0,0,-.157),(.94,.25,.02),accent)
        # Abstract identity mark, not generated unreadable text.
        box('Emblem',(-.32,0,-.173),(.12,.12,.015),stone)
        for y,w in [(.035,.40),(-.04,.27)]: box('Wordmark',(.10,y,-.173),(w,.026,.015),stone)
    elif kind=='planter':
        box('Planter',(0,.22,0),(1,.44,.48),stone,.035)
        box('Soil',(0,.445,0),(.86,.02,.34),bark)
        for x,y in [(-.28,.66),(0,.76),(.28,.62)]: foliage('Plant',(x,y,0),(.25,.32,.20),leaf if x else light)
    elif kind=='roof-unit' or kind=='utility-box':
        w,h,d=(1, .85,.8) if kind=='roof-unit' else (.85,1.2,.55)
        box('Cabinet',(0,h/2,0),(w,h,d),stone,.035)
        box('Inset',(0,h*.53,-d/2-.012),(w*.82,h*.74,.04),frame)
        for i in range(6): box('Louver',(0,h*.25+i*h*.09,-d/2-.045),(w*.68,.035,.04),accent)
        box('Cap',(0,h+.025,0),(w+.06,.065,d+.06),frame,.014)
    elif kind.startswith('tree'):
        column=kind=='tree-column'
        rod('Trunk',(0,0,0),(.1,3.7,0),.19,bark,7,top=.095)
        for x,z in [(-.65,.12),(.6,.35),(.15,-.6)]: rod('Branch',(0,2.2,0),(x,3.6,z),.09,bark,6,top=.04)
        crowns=[((-.7,3.7,.1),(1.3,1.3,1.3)),((.7,4,.2),(1.3,1.3,1.3)),((.1,4.9,-.2),(1.35,1.25,1.35)),((.1,3.8,-.8),(1.2,1.2,1.2))]
        if column: crowns=[((0,3.1,0),(.9,1.2,.9)),((.1,4.1,0),(1,1.4,1)),((0,5.3,.1),(.7,1.2,.7))]
        for i,(loc,size) in enumerate(crowns): foliage('Crown',loc,size,leaf if i%2==0 else light)
    elif kind=='bush':
        for i,(x,y,z) in enumerate([(-.4,.38,0),(0,.58,.05),(.4,.35,-.1)]):
            foliage('Shrub',(x,y,z),(.48,.46,.50),leaf if i%2==0 else light)
    join('CITY_'+kind.replace('-','_'))

if __name__=='__main__':
    parser=argparse.ArgumentParser(); parser.add_argument('--output',required=True)
    options=parser.parse_args(sys.argv[sys.argv.index('--')+1:])
    for kind in KINDS:
        build(kind); export(Path(options.output)/(kind+'.glb'))
