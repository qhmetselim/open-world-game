/** Development-only visual fixture using production view adapters, no gameplay hooks. */
import { Color, DirectionalLight, HemisphereLight, Mesh, MeshStandardMaterial, PerspectiveCamera, PlaneGeometry, Scene, Vector3 } from 'three';
import { defaultGameConfig } from '../core/Config';
import { createPlayerState } from '../player/PlayerState';
import { createNpcAppearance, createNpcIdentity } from '../npc/NpcIdentity';
import type { NpcState } from '../npc/NpcTypes';
import { createCombatState } from '../combat/CombatState';
import { combatConfig } from '../combat/CombatConfig';
import { coreModels } from './loaders/CoreModels';
import { Renderer } from './Renderer';
import { PlayerView } from './PlayerView';
import { NpcRenderResources, NpcView } from './NpcView';
import { CombatView } from './CombatView';
import { VehicleView } from './VehicleView';
import { createVehicleState } from '../vehicle/VehicleState';
import { VehiclePresentation } from './VehiclePresentation';
import { visualTheme } from './VisualTheme';

async function review(): Promise<void> {
  if (!import.meta.env.DEV) return;
  await coreModels.initialize();
  const scene = new Scene(); scene.background = new Color(0xa8bfc4);
  scene.add(new HemisphereLight(0xd7e8ed, 0x6d7062, 1.8));
  const sun = new DirectionalLight(0xfff1da, 3); sun.position.set(-3, 7, 4); scene.add(sun);
  sun.castShadow = true; sun.shadow.mapSize.set(1024,1024);
  sun.shadow.normalBias = visualTheme.shadows.normalBias; sun.shadow.bias = visualTheme.shadows.bias;
  Object.assign(sun.shadow.camera,{left:-7,right:7,top:7,bottom:-7,near:.1,far:30});
  const floor = new Mesh(new PlaneGeometry(100,100),new MeshStandardMaterial({color:0x6c8078,roughness:.95}));
  floor.rotation.x=-Math.PI/2; floor.receiveShadow=true; scene.add(floor);
  const renderer = new Renderer(document.body,defaultGameConfig.rendering);
  const camera = new PerspectiveCamera(37,innerWidth/innerHeight,.01,150);
  const player = createPlayerState({x:-2.5,y:.94,z:0}); player.facingYaw=Math.PI; player.grounded=true;
  const view = new PlayerView(scene,.94), gun = new CombatView(scene); gun.initializeModel();
  const weapon=createCombatState(combatConfig.pistol), aim=new Vector3(0,0,1);
  const resources = new NpcRenderResources();
  const people = [0,1,2,3].map(index=>{
    const identity=createNpcIdentity('character-review',`person:${index}`,'review',1,1);
    const appearance={...createNpcAppearance(identity.appearanceSeed),hairStyle:index%3};
    if(index===3)Object.assign(appearance,{shirtColor:0x213e60,pantsColor:0x17283a,heightScale:1,widthScale:1});
    const state:NpcState={id:identity.id,health:{current:100,maximum:100},position:{x:index*1.2-1,y:0,z:0},facingYaw:0,
      currentNodeId:'',destinationNodeId:undefined,pathNodeIds:[],pathIndex:0,activity:'idle',tier:'active',idleRemaining:0,tripIndex:0,backgroundElapsed:0,appearance};
    return {state,identity:{...identity,clothingSeed:index},police:index===3,view:new NpcView(scene,resources,{...identity,clothingSeed:index},state,index===3)};
  });
  const sedan = new VehicleView(scene,defaultGameConfig.vehicle.sedan);
  const vehicle=createVehicleState('review',{x:-2.5,y:.98,z:-3},0); sedan.update(vehicle);
  let mode='idle', angle=0, previous=performance.now(), corpse=0, paused=false;
  let transition: VehiclePresentation | undefined;
  document.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach(button=>button.addEventListener('click',()=>{
    if(mode==='dead')people.forEach(person=>{person.view.dispose();person.view=new NpcView(scene,resources,person.identity,person.state,person.police);});
    mode=button.dataset.mode!;corpse=0;paused=false;
    sedan.setDoorOpen(-1,0);sedan.setDoorOpen(1,0);
    transition=mode==='entry'||mode==='exit'?new VehiclePresentation(mode==='entry',
      {...player,position:{x:vehicle.position.x-2,y:.94,z:vehicle.position.z+.3}},vehicle):undefined;
  }));
  document.querySelector('#pause')!.addEventListener('click',()=>{paused=!paused;});
  for(const [label,seconds] of [['Door reach snapshot',.65],['Seat transfer snapshot',1.08]] as const) {
    const button=document.createElement('button');button.textContent=label;
    button.onclick=()=>{mode='entry';paused=true;transition=new VehiclePresentation(true,
      {...player,position:{x:vehicle.position.x-2,y:.94,z:vehicle.position.z+.3}},vehicle);transition.advance(seconds);};
    document.querySelector('nav')!.append(button);
  }
  document.querySelector('#angle')!.addEventListener('click',()=>{angle=(angle+1)%4;});
  let frame=0;
  const tick=(time:number)=>{
    const dt=paused?0:Math.min(.05,(time-previous)/1000);previous=time;corpse+=dt;
    const speed=mode==='walk'?1.4:mode==='run'?5:0;
    player.velocity.z=mode==='walk'?defaultGameConfig.player.walkSpeed:mode==='run'?defaultGameConfig.player.sprintSpeed:0;
    weapon.equipped=mode==='aim'||mode==='fire';weapon.aiming=weapon.equipped;
    gun.update(player,weapon,aim,mode==='fire'?Math.max(0,.11-corpse%.6):0,paused?Number.EPSILON:dt);
    view.update(player,gun.presenting,dt,gun.getGripPosition());view.setVisible(true);
    if(transition){transition.advance(dt);const sample=transition.sample(vehicle);sedan.setDoorOpen(transition.side,sample.door);
      view.update(sample.player,false,dt);view.vehiclePose(sample.seated,sample.door);view.setVisible(sample.visible);}
    people.forEach(({state,view})=>{state.actualSpeed=speed;state.activity=mode==='dead'?'dead':'walking';state.corpseOpacity=mode==='dead'?Math.max(0,1-corpse/4):1;view.update(state,dt);});
    camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();
    const yaw=angle*Math.PI/2+.15;camera.position.set(Math.sin(yaw)*10,3.4,Math.cos(yaw)*10);camera.lookAt(0,1,0);
    renderer.render(scene,camera);
    document.querySelector('#status')!.textContent=`${mode} · player / three civilians / police · ${renderer.drawCalls} draws · ${renderer.triangleCount.toLocaleString()} triangles · production view adapters`;
    frame=requestAnimationFrame(tick);
  };frame=requestAnimationFrame(tick);
  window.addEventListener('pagehide',()=>{cancelAnimationFrame(frame);view.dispose(scene);gun.dispose();people.forEach(p=>p.view.dispose());resources.dispose();sedan.dispose();floor.geometry.dispose();floor.material.dispose();coreModels.dispose();renderer.dispose();},{once:true});
}
void review().catch(console.error);
