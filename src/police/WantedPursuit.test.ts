import { expect, it } from 'vitest';
import { Scene } from 'three';
import { Wanted } from './Wanted';
import { policeConfig as rules } from './PoliceConfig';
import { PoliceManager } from './PoliceManager';
import { PoliceCar } from './PoliceCar';
import { nextChaseLane, policeSearchTarget } from './PolicePlanner';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { defaultGameConfig as config } from '../core/Config';
import type { UrbanMobilityNetwork } from '../city/UrbanMobility';

const point={x:0,y:1,z:0};
const crime={type:'npcDamaged' as const,actorId:'player:prototype',npcId:'npc:civilian',damage:34,health:66};
const kill={type:'npcKilled' as const,actorId:'player:prototype',npcId:'police:officer:test'};
const network:UrbanMobilityNetwork={lanes:[{id:'lane',roadId:'road',roadClass:'local',direction:'forward',laneIndex:0,speedMetadata:30,
  startNodeId:'a',endNodeId:'b',path:[{x:0,z:100},{x:0,z:-100}]}],laneConnections:[],intersections:[],crossings:[],
  pedestrianNodes:[],pedestrianConnections:[]};

it('crime dispatch enters CHASE immediately and missing/unavailable units cannot manufacture an escape',()=>{
  const wanted=new Wanted();expect(wanted.state.phase).toBe('CLEAR');
  wanted.crime(crime,point);expect(wanted.state.phase).toBe('CHASE');
  for(let i=0;i<300;i++)wanted.step(1,false,{x:200,y:1,z:0});
  expect(wanted.state).toMatchObject({phase:'CHASE',level:1,contactEstablished:false});
  wanted.step(.1,true,point);wanted.step(rules.chaseByLevel[1]-.1,false,point);
  expect(wanted.state.phase).toBe('CHASE');wanted.step(.2,false,point);
  expect(wanted.state.phase).toBe('SEARCH');
});

it.each([1,2,3])('level %s requires sustained loss of shared sight, searches without live position and eventually clears',level=>{
  const wanted=new Wanted();for(let i=0;i<rules.thresholds[level]!;i++)wanted.crime(crime,point);
  wanted.step(.1,true,point);
  wanted.step(rules.chaseByLevel[level]!-.5,false,{x:99,y:1,z:99});expect(wanted.state.phase).toBe('CHASE');
  wanted.step(.1,true,point); // any unit's radio sighting restarts the entire escape window
  wanted.step(rules.chaseByLevel[level]!-.1,false,point);expect(wanted.state.phase).toBe('CHASE');
  wanted.step(.2,false,{x:500,y:1,z:500});expect(wanted.state.phase).toBe('SEARCH');
  expect(wanted.state.lastKnown).toEqual(point);
  wanted.step(.1,true,{x:4,y:1,z:5});expect(wanted.state.phase).toBe('CHASE');
  wanted.step(rules.chaseByLevel[level]!+.1,false,point);expect(wanted.state.phase).toBe('SEARCH');
  const report={...wanted.state.lastKnown};
  for(let star=level;star>0;star--) {
    wanted.step(rules.searchByLevel[star]!+rules.decaySeconds+.1,false,{x:1000,y:1,z:0});
    expect(wanted.state.level).toBe(star-1);expect(wanted.state.lastKnown).toEqual(report);
  }
  expect(wanted.state).toMatchObject({phase:'CLEAR',searching:false,points:0});
});

it('police kill/new crime interrupts SEARCH, adds serious heat and holds fresh dispatch until reacquired',()=>{
  const wanted=new Wanted();wanted.crime(crime,point);wanted.step(.1,true,point);
  wanted.step(rules.chaseByLevel[1]+1,false,point);expect(wanted.state.phase).toBe('SEARCH');
  const revision=wanted.state.responseRevision;
  wanted.crime(kill,{x:5,y:1,z:5});
  expect(wanted.state).toMatchObject({phase:'CHASE',points:1+rules.crime.policeKill,unseenSeconds:0,crimeSeconds:0,contactEstablished:false,responseRevision:revision+1});
  wanted.step(120,false,point);expect(wanted.state.phase).toBe('CHASE');
  wanted.step(.1,true,point);wanted.step(rules.chaseByLevel[1]+.1,false,point);expect(wanted.state.phase).toBe('SEARCH');
  wanted.crime(crime,point);expect(wanted.state.phase).toBe('CHASE');
});

it('search waypoints depend only on frozen radio report, authored paths, unit id and search time',()=>{
  const roads={...network,lanes:[-20,0,20,200].map(x=>({...network.lanes[0]!,id:`lane:${x}`,path:[{x,z:100},{x,z:-100}]}))};
  const first=policeSearchTarget('police:car:1',point,9,roads);
  expect(policeSearchTarget('police:car:1',point,9,{...roads,lanes:[...roads.lanes].reverse()})).toEqual(first);
  for(let t=0;t<50;t++) {
    const search=policeSearchTarget('police:car:1',point,t,roads);
    expect(Math.hypot(search.x-point.x,search.z-point.z)).toBeLessThanOrEqual(rules.searchAreaRadius);
  }
});

it('real dispatch stays CHASE with no roads, then arrives without own LOS and replaces killed crew for a stationary suspect',async()=>{
  const physics=new PhysicsWorld();await physics.initialize();physics.createStaticBox([0,-.5,0],[150,.5,150]);
  const scene=new Scene();physics.step(1/60);
  const manager=new PoliceManager(scene,physics,config,{height:()=>0,loaded:()=>true,roadValid:()=>true},()=>undefined,()=>undefined);
  manager.wanted.crime(crime,point);
  const tick=(roads=network)=>{manager.step(1/60,{position:point,body:undefined,onFoot:true,alive:true},roads,point,{x:0,y:0,z:-1});physics.step(1/60);manager.captureAfterStep();};
  for(let i=0;i<1800;i++)tick({...network,lanes:[]});
  expect(manager.getDebugInfo()).toMatchObject({phase:'CHASE',cars:0,officers:0});
  for(let i=0;i<1800&&manager.getDebugInfo().officers===0;i++)tick();
  expect(manager.getDebugInfo().officers).toBe(1);
  const oldCars=new Set(manager.getMapMarkers().filter(m=>m.kind==='car').map(m=>m.id));
  for(const officer of manager.getNearbyActive(point,200)) {
    const result=manager.damage(officer.id,1000)!;expect(result.killed).toBe(true);
    manager.wanted.crime({...kill,npcId:officer.id},point);
  }
  tick();expect(manager.getDebugInfo()).toMatchObject({phase:'CHASE',officers:0});
  let replacement=false;
  for(let i=0;i<600;i++) {
    tick();expect(manager.wanted.state.phase).toBe('CHASE');
    replacement ||= manager.getMapMarkers().some(m=>m.kind==='car'&&!oldCars.has(m.id));
    expect(manager.getDebugInfo().cars).toBeLessThanOrEqual(rules.carsByLevel[manager.wanted.state.level]!);
  }
  expect(replacement).toBe(true);
  manager.dispose();expect(physics.vehicleControllerCount).toBe(0);expect(physics.bodyCount).toBe(1);expect(scene.children).toHaveLength(0);physics.dispose();
});

it('shared CHASE reaches a target behind the car via a real Rapier lane-graph loop, not a direct off-road turn',async()=>{
  const physics=new PhysicsWorld();await physics.initialize();physics.createStaticBox([0,-.5,0],[200,.5,200]);physics.step(1/60);
  const paths=[[{x:0,z:-40},{x:0,z:50}],[{x:0,z:50},{x:60,z:50}],
    [{x:60,z:50},{x:60,z:-40}],[{x:60,z:-40},{x:0,z:-40}]];
  const lanes=paths.map((path,i)=>({...network.lanes[0]!,id:`loop:${i}`,path}));
  const roads={...network,lanes,laneConnections:lanes.map((lane,i)=>({id:`turn:${i}`,intersectionId:`i:${i}`,incomingLaneId:lane.id,outgoingLaneId:lanes[(i+1)%4]!.id,turn:'left' as const}))};
  const target={x:0,y:1,z:-25};
  expect(nextChaseLane('loop:0',target,roads)).toBe('loop:1');
  const car=new PoliceCar(new Scene(),physics,config.vehicle,'police:loop',{x:0,y:1.05,z:10},0,'loop:0');
  const body=car.vehicle.getBody(),visited=new Set<string>();let returned=false;
  for(let i=0;i<3600;i++) {
    car.step(1/60,target,true,true,roads,2,false);physics.step(1/60);car.vehicle.syncFromPhysics();
    visited.add(car.laneId);
    if(visited.size===4&&car.laneId==='loop:0'){returned=true;break;}
  }
  expect(visited.size).toBe(4);expect(returned).toBe(true);expect(car.vehicle.getBody()).toBe(body);
  car.dispose();expect(physics.vehicleControllerCount).toBe(0);physics.dispose();
});

it('radio dispatch drives real response cars toward an occluded target while LOS still blocks engagement',async()=>{
  const physics=new PhysicsWorld();await physics.initialize();physics.createStaticBox([0,-.5,0],[150,.5,150]);
  const wall=physics.createStaticBox([0,3,8],[80,3,.4]);physics.step(1/60);
  let shots=0;
  const manager=new PoliceManager(new Scene(),physics,config,{height:()=>0,loaded:()=>true,roadValid:()=>true},()=>undefined,()=>{shots++;});
  manager.wanted.crime(crime,point);
  const tick=()=>{manager.step(1/60,{position:point,body:undefined,onFoot:true,alive:true},network,point,{x:0,y:0,z:-1});physics.step(1/60);manager.captureAfterStep();};
  tick();const start=manager.getVehicleObstacles()[0]!.z;
  for(let i=0;i<480;i++)tick();
  expect(manager.wanted.state).toMatchObject({phase:'CHASE',contactEstablished:false});
  expect(manager.getVehicleObstacles()[0]!.z).toBeLessThan(start-10);
  expect(manager.getMapMarkers().every(marker=>marker.mode==='chase')).toBe(true);
  expect(manager.getDebugInfo().officers).toBe(0);expect(shots).toBe(0);
  physics.removeRigidBody(wall);physics.step(1/60);tick();
  expect(manager.wanted.state.contactEstablished).toBe(true);
  manager.dispose();expect(physics.vehicleControllerCount).toBe(0);physics.dispose();
});
