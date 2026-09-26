import type { Scene } from 'three';
import type { RigidBody } from '@dimforge/rapier3d-compat';
import type { GameConfig } from '../core/Config';
import type { PhysicsWorld } from '../physics/PhysicsWorld';
import type { UrbanMobilityNetwork, VehicleLane } from '../city/UrbanMobility';
import type { CombatPoint } from '../combat/CombatState';
import type { ShotFeedback } from '../combat/CombatController';
import { NpcRenderResources } from '../render/NpcView';
import { validateTrafficSpawn } from '../traffic/TrafficSpawn';
import { lanePointAtProgress } from '../traffic/TrafficLogic';
import { hashStringToSeed } from '../world/SeededNoise';
import { Wanted } from './Wanted';
import { policeConfig as config } from './PoliceConfig';
import { hiddenResponsePosition, responseFootPoints } from './PolicePlanner';
import { PoliceOfficer } from './PoliceOfficer';
import { PoliceCar } from './PoliceCar';

export interface PoliceTarget {position:CombatPoint;body:RigidBody|undefined;onFoot:boolean;alive:boolean}
export interface PoliceEnvironment {
  height:(x:number,z:number)=>number;
  loaded:(x:number,z:number)=>boolean;
  roadValid:(lane:VehicleLane,x:number,z:number)=>boolean;
}
/** Bounded response population; no ownership of player input, camera, traffic or streaming focus. */
export class PoliceManager {
  public readonly wanted=new Wanted();
  private readonly officers=new Map<string,PoliceOfficer>();
  private readonly cars=new Map<string,PoliceCar>();
  private readonly resources=new NpcRenderResources();
  private response=0;
  private serial=0;
  public constructor(private readonly scene:Scene,private readonly physics:PhysicsWorld,private readonly gameConfig:GameConfig,
    private readonly environment:PoliceEnvironment,private readonly damagePlayer:(amount:number)=>void,private readonly effect:(shot:ShotFeedback)=>void) {}
  public getNearbyActive(point:CombatPoint,radius:number){return [...this.officers.values()].map(o=>o.state).filter(s=>Math.hypot(s.position.x-point.x,s.position.z-point.z)<radius);}
  public damage(id:string,amount:number){return this.officers.get(id)?.damage(amount);}
  public getVehicleObstacles(){return [...this.cars.values()].map(c=>({...c.vehicle.getState().position,speed:c.vehicle.getState().speed}));}
  public getDebugInfo(){return {level:this.wanted.state.level,searching:this.wanted.state.searching,officers:this.officers.size,cars:this.cars.size,
    engaging:[...this.officers.values()].filter(o=>o.activity==='ENGAGE').length};}
  public step(dt:number,target:PoliceTarget,network:UrbanMobilityNetwork,eye:CombatPoint,view:CombatPoint):void {
    let seen=false;
    if(target.alive&&this.wanted.state.level) {
      for(const officer of this.officers.values())seen=officer.sees(target.position,target.body)||seen;
      for(const car of this.cars.values()) {
        const pos=car.vehicle.getState().position;
        if(Math.hypot(pos.x-target.position.x,pos.z-target.position.z)<config.sightRange
          &&this.physics.hasInteractionLineOfSight({...pos,y:pos.y+1},target.position,car.vehicle.getBody(),target.body))seen=true;
      }
    }
    this.wanted.step(dt,seen,target.position);
    const active=this.wanted.state.level>0&&target.alive;
    this.response-=dt;
    if(active&&this.response<=0) {
      this.response=config.responseSeconds;
      // At most one response body per interval. Vehicles are prioritized during driving.
      const needsCar=this.cars.size<(config.carsByLevel[this.wanted.state.level]??0);
      let spawned=!target.onFoot&&needsCar&&this.spawnCar(target,network,eye,view);
      if(!spawned&&this.officers.size<(config.officersByLevel[this.wanted.state.level]??0))spawned=this.spawnOfficer(target,network,eye,view);
      if(!spawned&&target.onFoot&&needsCar)this.spawnCar(target,network,eye,view);
    }
    const destination=this.wanted.state.lastKnown;
    for(const [id,officer] of this.officers) {
      if(this.shouldRemove(officer.state.position,target,eye,view,!active||officer.deadSeconds>12)) {officer.dispose();this.officers.delete(id);continue;}
      officer.step(dt,destination,active&&officer.sees(target.position,target.body),active,target.onFoot,network,this.damagePlayer,this.effect);
    }
    for(const [id,car] of this.cars) {
      const state=car.vehicle.getState();
      if(this.shouldRemove(state.position,target,eye,view,!active||car.stalled>20||state.position.y<this.gameConfig.vehicle.recovery.killY)) {car.dispose();this.cars.delete(id);continue;}
      car.step(dt,destination,active,seen,network);
    }
  }
  public captureAfterStep():void{for(const car of this.cars.values())car.vehicle.syncFromPhysics();}
  public render(alpha:number,dt:number):void{for(const officer of this.officers.values())officer.render(alpha,dt);for(const car of this.cars.values())car.render(alpha);}
  public reset():void{for(const officer of this.officers.values())officer.dispose();for(const car of this.cars.values())car.dispose();this.officers.clear();this.cars.clear();this.wanted.reset();this.response=config.responseSeconds;}
  public dispose():void{this.reset();this.resources.dispose();}
  private shouldRemove(point:CombatPoint,target:PoliceTarget,eye:CombatPoint,view:CombatPoint,retire:boolean):boolean {
    const distance=Math.hypot(point.x-target.position.x,point.z-target.position.z);
    const behind=(point.x-eye.x)*view.x+(point.z-eye.z)*view.z<0;
    return !this.environment.loaded(point.x,point.z)||distance>config.despawnDistance||(retire&&distance>20&&behind);
  }
  private spawnOfficer(target:PoliceTarget,network:UrbanMobilityNetwork,eye:CombatPoint,view:CombatPoint):boolean {
    const candidates=responseFootPoints(network).filter(n=>hiddenResponsePosition(n.position,target.position,eye,view));
    candidates.sort((a,b)=>hashStringToSeed(a.id+this.serial)-hashStringToSeed(b.id+this.serial));
    for(const node of candidates) {
      const {x,z}=node.position;
      if(!this.environment.loaded(x,z))continue;
      const y=this.physics.groundHeight(x,z,this.environment.height(x,z));
      if(y===undefined||!this.physics.isCapsulePositionClear([x,y+.93,z],.58,.32,undefined))continue;
      if([...this.officers.values()].some(o=>Math.hypot(o.state.position.x-x,o.state.position.z-z)<3))continue;
      const id=`police:officer:${this.serial++}`;
      this.officers.set(id,new PoliceOfficer(this.scene,this.physics,this.resources,id,{x,y:y+.03,z}));return true;
    }
    return false;
  }
  private spawnCar(target:PoliceTarget,network:UrbanMobilityNetwork,eye:CombatPoint,view:CombatPoint):boolean {
    const lanes=[...network.lanes].sort((a,b)=>hashStringToSeed(a.id+this.serial)-hashStringToSeed(b.id+this.serial));
    for(const lane of lanes)for(const progress of [.25,.5,.75]) {
      const point=lanePointAtProgress(lane,progress);
      if(!hiddenResponsePosition(point,target.position,eye,view))continue;
      const spawn=validateTrafficSpawn(lane,progress,this.physics,this.gameConfig.vehicle.sedan,this.gameConfig.traffic,this.environment.height,this.environment.roadValid);
      if(!spawn)continue;
      const id=`police:car:${this.serial++}`;
      this.cars.set(id,new PoliceCar(this.scene,this.physics,this.gameConfig.vehicle,id,spawn.position,spawn.yaw,lane.id));return true;
    }
    return false;
  }
}
