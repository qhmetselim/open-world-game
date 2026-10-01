"""Visual-only compact/crossover siblings. Same sedan chassis origin, +Z forward,
X axle, wheel centres (+/- .75, -.61876, +/- 1.25), .36 m tire radius.
"""
import argparse
import sys
from pathlib import Path
import bpy
sys.path.insert(0,str(Path(__file__).parent))
from core_assets import mat, box, rod, mesh, loft, join, export


def build(kind):
    bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
    suv=kind=='crossover'
    paint=mat('VehiclePaint',(.30,.36,.29) if suv else (.40,.12,.075),.35,.38)
    dark=mat('Graphite',(.023,.031,.036),.18,.57)
    glass=mat('BlueGlass',(.035,.10,.14),.5,.24)
    silver=mat('SatinAlloy',(.37,.43,.45),.72,.34)
    light=mat('Headlamp',(.82,.86,.73),.1,.25,.25)
    red=mat('TailLamp',(.55,.026,.021),.1,.28,.2)
    length=2.06 if suv else 1.92
    width=.925 if suv else .865
    deck=.43 if suv else .29
    roof=1.09 if suv else .80
    rear=-1.42 if suv else -1.21
    body=loft('Coachwork',[(-length,width*.90,-.47,deck-.06),(-length+.15,width,-.58,deck),
        (-.65,width,-.60,deck+.01),(.77,width,-.60,deck),
        (length-.16,width,-.52,deck-.035),(length,width*.87,-.40,deck-.10)],paint)
    for z in [-1.25,1.25]:
        cutter=rod('ArchCutter',(-1.2,-.60,z),(1.2,-.60,z),.46,dark,20)
        bpy.context.view_layer.objects.active=body
        mod=body.modifiers.new('Wheel arch','BOOLEAN');mod.operation='DIFFERENCE';mod.object=cutter
        bpy.ops.object.modifier_apply(modifier=mod.name);bpy.data.objects.remove(cutter,do_unlink=True)
        if suv:
            # Angular arch cladding, following the same wheel envelope rather than moving axles.
            for side in [-1,1]:
                vertices=[]
                import math
                for radius in [.465,.525]:
                    for i in range(9):
                        a=i*math.pi/8
                        vertices.append((side*(width+.005),-.60+radius*math.sin(a),z+radius*math.cos(a)))
                mesh('ArchCladding',vertices,[(i,i+1,i+10,i+9) for i in range(8)],dark)
    # Upright liftgate/continuous roof, distinct from the sedan's separate rear deck.
    mesh('Cabin',[(-width*.89,deck,-length+.13),(width*.89,deck,-length+.13),
        (width*.89,deck,1.03),(-width*.89,deck,1.03),
        (-.69,roof,rear),(.69,roof,rear),(.67,roof,.49),(-.67,roof,.49)],
        [(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7),(4,5,6,7),(0,3,2,1)],paint)
    # Project glass onto the actual roofline slope with a single 8 mm exterior offset.
    # Fixed coordinates would bury the top edge in the taller crossover windshield.
    lower_z=1.03-.54*.065/(roof-deck)+.008
    upper_z=.49+.54*.055/(roof-deck)+.008
    mesh('Windscreen',[(-.69,deck+.065,lower_z),(.69,deck+.065,lower_z),(.585,roof-.055,upper_z),(-.585,roof-.055,upper_z)],[(0,1,2,3)],glass)
    mesh('HatchGlass',[(-.66,deck+.12,-length+.169),(-.60,roof-.055,rear-.03),(.60,roof-.055,rear-.03),(.66,deck+.12,-length+.169)],[(0,1,2,3)],glass)
    for side in [-1,1]:
        x=side*(width*.89+.006)
        for za,zb,ta,tb in [(-length+.25,-.25,rear+.06,-.25),(-.17,.9,-.17,.44)]:
            mesh('SideGlass',[(x,deck+.07,za),(x,deck+.07,zb),(side*.68,roof-.065,tb),(side*.697,roof-.065,ta)],[(0,1,2,3)],glass)
        box('Mirror',(side*(width+.075),deck+.17,.68),(.18,.12,.22),dark,.025)
        for z in [-.64,.55]:box('Handle',(side*(width+.008),deck-.10,z),(.022,.038,.15),silver,.012)
        box('Sill',(side*(width-.04),-.54,0),(.095,.13,1.42),dark if suv else paint,.025)
        if suv:
            box('RoofRail',(side*.55,roof+.055,-.41),(.045,.055,1.60),silver,.015)
            for z in [-1.08,.26]:
                box('RailMount',(side*.55,roof+.018,z),(.065,.055,.13),dark,.01)
            box('SplitHeadlamp',(side*.60,deck-.02,length-.029),(.39,.055,.049),light,.012)
            box('LowerLamp',(side*.61,-.055,length-.039),(.19,.09,.057),light,.014)
            box('TailBlade',(side*.64,.20,-length-.012),(.12,.24,.045),red,.012)
            box('TailReturn',(side*.53,.29,-length-.012),(.28,.065,.045),red,.012)
        else:
            box('CompactHeadlamp',(side*.56,deck-.06,length-.011),(.28,.14,.074),light,.033)
            box('HatchTailLamp',(side*.61,.105,-length-.012),(.23,.19,.045),red,.019)
    for z in [-length+.016,length-.016]:
        box('Bumper',(0,-.22,z),(width*1.75,.23,.12),dark,.045)
        box('Plate',(0,-.14,z+(.068 if z>0 else -.068)),(.36,.11,.017),silver,.01)
    box('Grille',(0,deck-.15,length+.018),(.70,.12,.028),dark,.014)
    if suv:box('SkidPlate',(0,-.37,length+.021),(.85,.11,.03),silver,.016)
    else:box('RearSpoiler',(0,roof-.005,rear-.08),(1.43,.07,.20),paint,.025)
    join('BODY_Crossover' if suv else 'BODY_Hatchback')


if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--output',required=True)
    options=parser.parse_args(sys.argv[sys.argv.index('--')+1:])
    for kind in ['hatchback','crossover']:
        build(kind);export(Path(options.output)/(kind+'.glb'))
