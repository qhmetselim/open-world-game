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
import { hiddenResponsePosition } from './PolicePlanner';
import { getVehicleExitCandidates, isVehicleEnterEligible } from '../vehicle/VehicleInteraction';
import type { VehicleManager } from '../vehicle/VehicleManager';
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
  public getEnterCandidate(position:CombatPoint,interaction:GameConfig['vehicle']['interaction']) {
    return [...this.cars.values()].map(car=>car.vehicle.getState())
      .filter(state=>isVehicleEnterEligible(position,state,interaction.enterDistance,interaction.maxEnterSpeed))
      .sort((a,b)=>Math.hypot(a.position.x-position.x,a.position.z-position.z)-Math.hypot(b.position.x-position.x,b.position.z-position.z)||a.id.localeCompare(b.id))[0];
  }
  /** Same single-owner handoff as traffic takeover; no new chassis/controller/view. */
  public takeOver(id:string,position:CombatPoint,manager:VehicleManager) {
    const car=this.cars.get(id),interaction=this.gameConfig.vehicle.interaction;
    if(!car||manager.getVehicleById(id)||!isVehicleEnterEligible(position,car.vehicle.getState(),interaction.enterDistance,interaction.maxEnterSpeed))return undefined;
    const vehicle=car.transferTo(manager);this.cars.delete(id);return vehicle;
  }
  public getMapMarkers() {
    return [...[...this.cars.values()].filter(car=>!car.retired).map(car=>({id:car.vehicle.getState().id,kind:'car' as const,
      position:{...car.vehicle.getState().position},forward:{x:Math.sin(car.vehicle.getState().yaw),z:Math.cos(car.vehicle.getState().yaw)},
      mode:car.activity==='SEARCH'?'search' as const:'chase' as const})),
    ...[...this.officers.values()].filter(o=>o.state.health.current>0).map(o=>({id:o.state.id,kind:'officer' as const,
      position:{...o.state.position},forward:{x:Math.sin(o.state.facingYaw),z:Math.cos(o.state.facingYaw)},
      mode:o.activity==='SEARCH'?'search' as const:'chase' as const}))];
  }
  public getVehicleObstacles(){return [...this.cars.values()].map(c=>({...c.vehicle.getState().position,speed:c.vehicle.getState().speed}));}
  public getDebugInfo(){return {level:this.wanted.state.level,searching:this.wanted.state.searching,officers:[...this.officers.values()].filter(o=>o.state.health.current>0).length,cars:[...this.cars.values()].filter(c=>!c.retired).length,
    engaging:[...this.officers.values()].filter(o=>o.activity==='ENGAGE').length};}
  public step(dt:number,target:PoliceTarget,network:UrbanMobilityNetwork,eye:CombatPoint,view:CombatPoint):void {
    const velocity=target.body?.linvel();
    const canDisembark=target.onFoot||!!velocity&&Math.hypot(velocity.x,velocity.z)<config.arrival.maxSpeed;
    // Empty/disabled units cannot witness crimes or permanently occupy response slots.
    for(const car of this.cars.values()) {
      const noCrew=car.deployed>0&&!car.crewIds.some(id=>(this.officers.get(id)?.state.health.current??0)>0);
      if(noCrew||car.stalled>config.reinforcement.disabledSeconds||car.vehicle.getState().position.y<this.gameConfig.vehicle.recovery.killY
        ||(!canDisembark&&car.deployed>0))car.retired=true;
      if(car.retired)car.retiredSeconds+=dt;
    }
    let seen=false;
    const seeingCars=new Set<string>();
    if(target.alive&&this.wanted.state.level) {
      for(const officer of this.officers.values())seen=officer.sees(target.position,target.body,this.wanted.state.level)||seen;
      for(const car of this.cars.values()) {
        if(car.retired||car.deployed>0)continue;
        const pos=car.vehicle.getState().position;
        if(Math.hypot(pos.x-target.position.x,pos.z-target.position.z)<(config.sightByLevel[this.wanted.state.level]??config.sightRange)
          &&this.physics.hasInteractionLineOfSight({...pos,y:pos.y+1},target.position,car.vehicle.getBody(),target.body)){
          seen=true;seeingCars.add(car.vehicle.getState().id);
        }
      }
    }
    this.wanted.step(dt,seen,target.position);
    const active=this.wanted.state.level>0&&target.alive;
    this.response-=dt;
    if(active&&this.response<=0) {
      this.response=config.responseByLevel[this.wanted.state.level]??config.responseSeconds;
      // Every response arrives on a validated lane in an existing Rapier sedan.
      // No detached foot-spawn fallback: unavailable roads defer response.
      const targetCars=config.carsByLevel[this.wanted.state.level]??0;
      const needsCar=[...this.cars.values()].filter(car=>!car.retired).length<targetCars;
      if(needsCar&&this.cars.size<targetCars+config.reinforcement.maxRetiredCars)this.spawnCar(target,network,eye,view);
    }
    const destination=this.wanted.state.lastKnown;
    for(const [id,officer] of this.officers) {
      if(officer.deadSeconds>config.reinforcement.retireSeconds||this.shouldRemove(officer.state.position,target,eye,view,!active)) {officer.dispose();this.officers.delete(id);continue;}
      officer.step(dt,destination,active&&officer.sees(target.position,target.body,this.wanted.state.level),active,target.onFoot,network,this.damagePlayer,this.effect,this.wanted.state.level);
    }
    for(const [id,car] of this.cars) {
      const state=car.vehicle.getState();
      if(car.retiredSeconds>config.reinforcement.retireSeconds||this.shouldRemove(state.position,target,eye,view,!active)) {car.dispose();this.cars.delete(id);continue;}
      const arrivalVisible=seeingCars.has(id)||car.deployed>0&&this.physics.hasInteractionLineOfSight(
        {...state.position,y:state.position.y+1},target.position,car.vehicle.getBody(),target.body);
      car.step(dt,destination,active,seen,network,this.wanted.state.level,canDisembark&&arrivalVisible);
      if(active&&!car.retired&&canDisembark&&arrivalVisible&&car.exitCooldown===0&&car.deployed<config.arrival.crewPerCar
        &&[...this.officers.values()].filter(o=>o.state.health.current>0).length<(config.officersByLevel[this.wanted.state.level]??0)
        &&state.speed<config.arrival.maxSpeed
        &&Math.hypot(state.position.x-destination.x,state.position.z-destination.z)<config.arrival.deployDistance) {
        // One checked door-side exit per car/interval. Blocked exits are retried, never teleported.
        car.exitCooldown=config.arrival.exitInterval;
        const officerId=this.deployOfficer(car);
        if(officerId){car.deployed++;car.crewIds.push(officerId);}
      }
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
  private deployOfficer(car:PoliceCar):string|undefined {
    for(const {x,z} of getVehicleExitCandidates(car.vehicle.getState(),this.gameConfig.vehicle)) {
      if(!this.environment.loaded(x,z))continue;
      const y=this.physics.groundHeight(x,z,this.environment.height(x,z));
      if(y===undefined||!this.physics.isCapsulePositionClear([x,y+.93,z],.58,.32,undefined))continue;
      if([...this.officers.values()].some(o=>Math.hypot(o.state.position.x-x,o.state.position.z-z)<1.2))continue;
      const id=`police:officer:${this.serial++}`;
      this.officers.set(id,new PoliceOfficer(this.scene,this.physics,this.resources,id,{x,y:y+.03,z}));return id;
    }
    return undefined;
  }
  private spawnCar(target:PoliceTarget,network:UrbanMobilityNetwork,eye:CombatPoint,view:CombatPoint):boolean {
    const occupiedLanes=new Set([...this.cars.values()].map(car=>car.laneId));
    const lanes=[...network.lanes].sort((a,b)=>Number(occupiedLanes.has(a.id))-Number(occupiedLanes.has(b.id))
      ||hashStringToSeed(a.id+this.serial)-hashStringToSeed(b.id+this.serial));
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
