import { expect,it } from 'vitest';
import { Scene } from 'three';
import { Wanted } from './Wanted';
import { policeConfig } from './PoliceConfig';
import { MoneyDrops } from '../economy/MoneyDrops';
import { PersonalAssets } from '../economy/PersonalAssets';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { PoliceManager } from './PoliceManager';
import { defaultGameConfig as config } from '../core/Config';
import type { UrbanMobilityNetwork } from '../city/UrbanMobility';
import { hiddenResponsePosition,nextChaseLane,responseFootPoints } from './PolicePlanner';
import { CombatController } from '../combat/CombatController';
import { createHealth,applyDamage } from '../combat/Health';
import type { ShotFeedback } from '../combat/CombatController';
import { PoliceCar } from './PoliceCar';
import { PoliceOfficer } from './PoliceOfficer';
import { NpcRenderResources } from '../render/NpcView';

const crime={type:'weaponFired' as const,actorId:'player:prototype',weaponId:'pistol',position:{x:0,y:1,z:0},direction:{x:0,y:0,z:-1}};
const position={x:0,y:1,z:0};
const network:UrbanMobilityNetwork={lanes:[{id:'lane',roadId:'road',roadClass:'local',direction:'forward',laneIndex:0,speedMetadata:30,
  startNodeId:'a',endNodeId:'b',path:[{x:0,z:100},{x:0,z:-100}]}],laneConnections:[],intersections:[],crossings:[],
  pedestrianNodes:[{id:'p1',position:{x:6,z:45},roadId:'road',side:'left',connectionIds:['walk']},{id:'p2',position:{x:6,z:-45},roadId:'road',side:'left',connectionIds:['walk']}],
  pedestrianConnections:[{id:'walk',fromNodeId:'p1',toNodeId:'p2',type:'sidewalk'}]};

it('wanted consumes player crimes only, caps at 3, tracks visible target and decays without clairvoyance',()=>{
  const wanted=new Wanted();wanted.crime({...crime,actorId:'police:1'},position);expect(wanted.state.level).toBe(0);
  wanted.crime(crime,position);expect(wanted.state.level).toBe(1);
  wanted.crime({type:'npcKilled',actorId:crime.actorId,npcId:'n'},position);expect(wanted.state.level).toBe(2);
  wanted.crime({type:'npcKilled',actorId:crime.actorId,npcId:'n2'},position);expect(wanted.state.level).toBe(3);
  wanted.step(20,true,{x:10,y:1,z:0});expect(wanted.state.unseenSeconds).toBe(0);
  wanted.step(10,false,{x:100,y:1,z:0});expect(wanted.state.lastKnown.x).toBe(10);
  for(let i=0;i<600;i++)wanted.step(.1,false,{x:100,y:1,z:0});expect(wanted.state.level).toBe(0);
  expect(JSON.parse(JSON.stringify(wanted.state))).toEqual(wanted.state);
});

it('drops are bounded, expire, respect walls and credit once through the existing kuruş economy',()=>{
  const drops=new MoneyDrops(),assets=new PersonalAssets(0);
  drops.spawn('police:test',{x:0,y:0,z:0});expect(drops.active.size).toBe(0);
  drops.spawn('npc:1',{x:0,y:0,z:0});const amount=drops.active.get('npc:1')!.amount;
  drops.step(1,position,true,assets,()=>false);expect(assets.balance).toBe(0);
  drops.step(1,position,false,assets,()=>true);expect(assets.balance).toBe(0);
  drops.step(1,position,true,assets,()=>true);expect(assets.balance).toBe(amount);
  drops.step(1,position,true,assets,()=>true);expect(assets.balance).toBe(amount);
  for(let i=0;i<50;i++)drops.spawn(`npc:${i}`,{x:50,y:0,z:0});expect(drops.active.size).toBe(policeConfig.drops.max);
  drops.step(91,position,true,assets,()=>true);expect(drops.active.size).toBe(0);
});

it('response points avoid the view and routing uses connected lanes only',()=>{
  expect(hiddenResponsePosition({x:0,z:50},position,position,{x:0,z:-1})).toBe(true);
  expect(hiddenResponsePosition({x:0,z:-50},position,position,{x:0,z:-1})).toBe(false);
  expect(hiddenResponsePosition({x:0,z:2},position,position,{x:0,z:-1})).toBe(false);
  expect(nextChaseLane('lane',position,network)).toBeUndefined();
  const outgoing={...network.lanes[0]!,id:'out',path:[{x:0,z:-100},{x:100,z:-100}]};
  expect(nextChaseLane('lane',{x:80,z:-100},{...network,lanes:[...network.lanes,outgoing],laneConnections:[{id:'turn',intersectionId:'i',incomingLaneId:'lane',outgoingLaneId:'out',turn:'left'}]})).toBe('out');
  const longSidewalk={...network,pedestrianNodes:network.pedestrianNodes.map((n,i)=>({...n,position:{x:i?100:-100,z:60}}))};
  expect(longSidewalk.pedestrianNodes.some(n=>hiddenResponsePosition(n.position,position,position,{x:0,z:-1}))).toBe(false);
  expect(responseFootPoints(longSidewalk).some(n=>hiddenResponsePosition(n.position,position,position,{x:0,z:-1}))).toBe(true);
});

it('real police response walks/chases, fires with LOS, takes pistol damage, searches and unloads every resource',async()=>{
  const physics=new PhysicsWorld();await physics.initialize();const scene=new Scene();
  const floor=physics.createStaticBox([0,-.5,0],[150,.5,150]);physics.step(1/60);
  const health=createHealth(),shots:ShotFeedback[]=[];
  let loaded=true;
  const manager=new PoliceManager(scene,physics,config,{height:()=>0,loaded:()=>loaded,roadValid:()=>loaded},amount=>applyDamage(health,amount),shot=>shots.push(shot));
  manager.wanted.crime(crime,position);
  const tick=()=>{manager.step(1/60,{position,body:undefined,onFoot:true,alive:health.current>0},network,{x:0,y:3,z:5},{x:0,y:0,z:-1});physics.step(1/60);manager.captureAfterStep();};
  for(let i=0;i<750;i++)tick();
  expect(manager.getDebugInfo().officers).toBe(1);expect(manager.getDebugInfo().cars).toBe(1);
  expect(health.current).toBeLessThan(100);expect(shots.length).toBeGreaterThan(0);
  const officer=manager.getNearbyActive(position,100)[0]!;expect(officer.position.z).toBeLessThan(35);
  const combat=new CombatController(physics,manager);
  const eye={x:officer.position.x,y:officer.position.y+1,z:officer.position.z-5};
  for(let i=0;i<3;i++)combat.step(.3,{allowed:true,locked:true,equip:i===0,aim:true,fire:true,reload:false},eye,eye,{x:0,y:0,z:1});
  expect(officer.health.current).toBe(0);expect(officer.activity).toBe('dead');
  loaded=false;tick();expect(manager.getDebugInfo().officers).toBe(0);expect(manager.getDebugInfo().cars).toBe(0);
  manager.dispose();combat.dispose();physics.removeRigidBody(floor);expect(physics.bodyCount).toBe(0);expect(physics.vehicleControllerCount).toBe(0);expect(scene.children).toHaveLength(0);physics.dispose();
});

it('police sedan uses four real Rapier wheels to chase a changing target without replacing the chassis',async()=>{
  const physics=new PhysicsWorld();await physics.initialize();const scene=new Scene();physics.createStaticBox([0,-.5,0],[150,.5,150]);physics.step(1/60);
  const car=new PoliceCar(scene,physics,config.vehicle,'police:car:test',{x:0,y:1.05,z:50},Math.PI,'lane');
  const body=car.vehicle.getBody(),start=car.vehicle.getState().position.z;
  for(let i=0;i<300;i++){car.step(1/60,{x:0,y:1,z:i<150?0:-30},true,true,network);physics.step(1/60);car.vehicle.syncFromPhysics();}
  expect(car.vehicle.getState().position.z).toBeLessThan(start-5);expect(car.vehicle.getState().wheelContactCount).toBeGreaterThan(0);
  expect(car.vehicle.getBody()).toBe(body);car.dispose();expect(physics.vehicleControllerCount).toBe(0);expect(physics.bodyCount).toBe(1);expect(scene.children).toHaveLength(0);physics.dispose();
});

it('real cover prevents police fire, loss of sight searches last-known position and cleanup removes the character',async()=>{
  const physics=new PhysicsWorld();await physics.initialize();const scene=new Scene(),resources=new NpcRenderResources();
  physics.createStaticBox([0,-.5,0],[50,.5,50]);
  const wall=physics.createStaticBox([0,2,10],[30,2,.3]);
  const officer=new PoliceOfficer(scene,physics,resources,'police:cover',{x:0,y:.03,z:18});physics.step(1/60);
  let damage=0;
  const step=()=>{officer.step(1/60,position,officer.sees(position,undefined),true,true,network,n=>{damage+=n;},()=>undefined);physics.step(1/60);};
  for(let i=0;i<180;i++)step();
  expect(damage).toBe(0);expect(officer.activity).toBe('SEARCH');
  physics.removeRigidBody(wall);physics.step(1/60);
  for(let i=0;i<180;i++)step();
  expect(damage).toBeGreaterThan(0);expect(officer.activity).toBe('ENGAGE');
  officer.dispose();resources.dispose();expect(physics.bodyCount).toBe(1);expect(scene.children).toHaveLength(0);physics.dispose();
});

it.each([-1,1])('police follows a connected %s turn with real chassis yaw and no steering convention override',async(sign)=>{
  const physics=new PhysicsWorld();await physics.initialize();const scene=new Scene();physics.createStaticBox([0,-.5,80],[200,.5,200]);physics.step(1/60);
  const incoming={...network.lanes[0]!,id:'in',path:[{x:0,z:40},{x:0,z:120}]};
  const outgoing={...incoming,id:'out',path:[{x:0,z:120},{x:sign*100,z:120}]};
  const roads={...network,lanes:[incoming,outgoing],laneConnections:[{id:'turn',intersectionId:'i',incomingLaneId:'in',outgoingLaneId:'out',turn:'left' as const}]};
  const car=new PoliceCar(scene,physics,config.vehicle,'police:turn',{x:0,y:1.05,z:45},0,'in');
  for(let i=0;i<1800;i++){car.step(1/60,{x:sign*80,y:1,z:120},true,true,roads);physics.step(1/60);car.vehicle.syncFromPhysics();}
  expect(car.laneId).toBe('out');expect(car.vehicle.getState().position.x*sign).toBeGreaterThan(10);
  expect(car.vehicle.getState().yaw*sign).toBeGreaterThan(1);car.dispose();physics.dispose();
});
