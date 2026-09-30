"""Shared rigid-part human library. Metres, +Z forward; named joint-local modules.
No skinning/animation bake: existing runtime limb animation owns the pivots.
"""
import argparse
import math
import sys
from pathlib import Path
import bpy
sys.path.insert(0, str(Path(__file__).parent))
from core_assets import box, mesh, rod, mat, export


def section(name, rings, material):
    # y, half-width, half-depth, z centre: shaped octagonal anatomy/clothing.
    vertices = []
    for y, w, d, z in rings:
        vertices += [(w*x, y, z+d*t) for x,t in [(-.7,-1),(.7,-1),(1,-.6),(1,.6),(.7,1),(-.7,1),(-1,.6),(-1,-.6)]]
    faces = [tuple(reversed(range(8))), tuple(range(len(vertices)-8,len(vertices)))]
    for i in range(len(rings)-1):
        for j in range(8): faces.append((i*8+j,i*8+(j+1)%8,(i+1)*8+(j+1)%8,(i+1)*8+j))
    return mesh(name, vertices, faces, material)


def build():
    bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
    materials = {k:mat(k,c) for k,c in {
        'Skin':(.60,.36,.23),'Shirt':(.08,.24,.28),'Pants':(.065,.09,.12),
        'Hair':(.038,.026,.022),'Leather':(.025,.033,.038),'Sole':(.42,.46,.44),
        'Trim':(.55,.62,.60),'Eye':(.015,.02,.022),'Uniform':(.022,.057,.105),
        'Badge':(.63,.51,.22)}.items()}
    def part(name, make):
        before=set(bpy.context.scene.objects)
        make()
        root=bpy.data.objects.new(name,None); bpy.context.collection.objects.link(root)
        for obj in set(bpy.context.scene.objects)-before-{root}: obj.parent=root
        root['pivot']='joint-local; runtime Y-up; forward +Z'
    s=materials
    def torso(style):
        cloth=s['Uniform'] if style==3 else s['Shirt']
        bottom=-.48 if style==2 else -.39
        section('Waist',[(-.60,.208,.132,0),(-.49,.216,.143,0),(-.35,.192,.126,0)],s['Pants'])
        section('TailoredBody',[(bottom,.205,.13,0),(-.21,.195,.125,0),(-.02,.265,.15,0),(.045,.215,.13,0)],cloth)
        rod('Neck',(0,.025,0),(0,.145,0),.074,s['Skin'],8)
        for side in [-1,1]:
            collar=box('Collar',(side*.065,.043,.122),(.10,.075,.033),cloth,.012)
            collar.rotation_euler.z=side*.3
        if style in (1,2):
            box('Zip',(0,-.16,.146),(.015,.35,.014),s['Trim'])
            for x in [-.13,.13]: box('Pocket',(x,-.21,.139),(.09,.09,.025),cloth,.008)
        if style==3:
            box('DutyBelt',(0,-.365,0),(.43,.065,.285),s['Leather'],.012)
            for x in [-.22,.22]: box('BeltPouch',(x,-.40,.015),(.09,.13,.105),s['Leather'],.014)
            box('Badge',(-.115,-.065,.16),(.058,.074,.018),s['Badge'],.01)
            box('Radio',(.12,-.11,.165),(.065,.11,.033),s['Leather'],.01)
            for x in [-.22,.22]: box('Epaulette',(x,.04,0),(.072,.025,.18),s['Trim'],.006)
    for style in range(4): part('torso'+str(style),lambda style=style:torso(style))
    def head():
        section('Face',[(-.015,.068,.071,.012),(.03,.105,.09,.007),(.14,.119,.102,0),(.245,.10,.089,-.008),(.28,.062,.062,-.012)],s['Skin'])
        for x in [-.125,.125]: box('Ear',(x,.115,0),(.033,.073,.045),s['Skin'],.012)
        mesh('Nose',[(-.027,.10,.096),(.027,.10,.096),(0,.18,.095),(0,.11,.139)],[(0,1,3),(1,2,3),(2,0,3),(0,2,1)],s['Skin'])
        for x in [-.049,.049]: box('Eye',(x,.153,.101),(.025,.018,.011),s['Eye'],.004)
        box('Mouth',(0,.055,.093),(.045,.009,.01),s['Hair'])
    part('head',head)
    def hair(style):
        section('HairCrown',[(.20,.116,.096,-.011),(.27,.113,.098,-.014),(.31 if style!=1 else .355,.078,.074,-.018),(.32 if style!=1 else .375,.04,.042,-.016)],s['Hair'])
        if style==1:
            section('SweptFringe',[(.23,.095,.025,.077),(.33,.095,.04,.072),(.365,.03,.027,.033)],s['Hair'])
        if style==2:
            section('BobBack',[(.045,.13,.061,-.083),(.15,.134,.066,-.070),(.25,.11,.057,-.048)],s['Hair'])
            for x in [-.105,.105]: box('BobSide',(x,.12,-.01),(.037,.20,.11),s['Hair'],.015)
    for style in range(3): part('hair'+str(style),lambda style=style:hair(style))
    def arm():
        section('Sleeve',[(-.30,.062,.065,0),(-.18,.072,.075,0),(-.025,.078,.084,0),(.025,.052,.062,0)],s['Shirt'])
    part('upperArm',arm)
    def forearm():
        section('Forearm',[(-.24,.046,.046,.015),(-.16,.060,.054,.006),(0,.062,.064,0)],s['Skin'])
        section('Hand',[(-.34,.047,.045,.016),(-.26,.052,.046,.025),(-.225,.042,.04,.015)],s['Skin'])
    part('forearm',forearm)
    def leg(style):
        w=.099 if style==0 else .116
        section('Trousers',[(-.81,.067,.075,.01),(-.49,w*.79,.089,.008),(-.42,w*.8,.096,.022),(-.18,w,.112,0),(0,w,.112,0)],s['Pants'])
        section('Shoe',[(-.94,.083,.155,.05),(-.90,.089,.17,.065),(-.82,.078,.145,.05),(-.78,.067,.075,0)],s['Leather'])
        box('Sole',(0,-.926,.058),(.178,.027,.326),s['Sole'],.012)
    for style in range(2): part('leg'+str(style),lambda style=style:leg(style))
    def cap():
        section('Cap',[(.225,.127,.112,-.008),(.285,.125,.104,-.015),(.315,.078,.07,-.012)],s['Uniform'])
        box('Peak',(0,.224,.121),(.23,.026,.13),s['Leather'],.022)
        box('CapBadge',(0,.264,.105),(.047,.043,.018),s['Badge'],.008)
    part('cap',cap)


if __name__=='__main__':
    parser=argparse.ArgumentParser(); parser.add_argument('--output',required=True)
    options=parser.parse_args(sys.argv[sys.argv.index('--')+1:])
    build(); bpy.ops.object.select_all(action='SELECT')
    export(Path(options.output)/'human.glb')
