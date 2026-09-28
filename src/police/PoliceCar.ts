import type { Scene } from 'three';
import type { GameConfig } from '../core/Config';
import type { PhysicsWorld } from '../physics/PhysicsWorld';
import type { CombatPoint } from '../combat/CombatState';
import type { UrbanMobilityNetwork } from '../city/UrbanMobility';
import { VehicleController } from '../vehicle/VehicleController';
import { PoliceVehicleView } from '../render/PoliceVehicleView';
import { buildTrafficPath,projectPath,pathLength,samplePath,pursuitSteering } from '../traffic/TrafficPath';
import { speedControl } from '../traffic/TrafficLogic';
import { getSteeringLimit } from '../vehicle/VehicleMovement';
import { nextChaseLane,pursuitPassingLanes } from './PolicePlanner';
import { policeConfig } from './PoliceConfig';
import type { VehicleManager } from '../vehicle/VehicleManager';

export class PoliceCar {
  public readonly vehicle:VehicleController;
  public activity:'SEARCH'|'CHASE'='SEARCH';
  public stalled=0;
  public deployed=0;
  public exitCooldown=0;
  public readonly crewIds:string[]=[];
  public retired=false;
  public retiredSeconds=0;
  private transferred=false;
  private readonly view:PoliceVehicleView;
  private next:string|undefined;
  private replan=0;
  private passing:string|undefined;
  public constructor(scene:Scene,private readonly physics:PhysicsWorld,private readonly config:GameConfig['vehicle'],id:string,
    position:CombatPoint,yaw:number,public laneId:string) {
    this.vehicle=new VehicleController(config,physics,id,position,yaw);this.vehicle.initialize();
    this.view=new PoliceVehicleView(scene,config.sedan);
  }
  public step(dt:number,target:CombatPoint,active:boolean,seen:boolean,network:UrbanMobilityNetwork,level=1,onFoot=false):void {
    this.activity=seen?'CHASE':'SEARCH';
    const state=this.vehicle.getState(),lane=network.lanes.find(l=>l.id===this.laneId);
    this.exitCooldown=Math.max(0,this.exitCooldown-dt);
    if(this.transferred)return;
    if(!active||!lane||this.retired||this.deployed>0){this.vehicle.idleFixedUpdate(dt);return;}
    this.replan-=dt;
    const laneProjection=projectPath(lane.path,state.position);
    // Replan while approaching, but do not change the curve under a turning car.
    if(this.replan<=0&&(!this.next||pathLength(lane.path)-laneProjection.distance>policeConfig.pursuit.commitmentDistance)){
      this.next=nextChaseLane(lane.id,target,network);this.replan=policeConfig.replanSeconds;
    }
    const forward={x:Math.sin(state.yaw),z:Math.cos(state.yaw)};
    const obstacle=this.physics.castRay([state.position.x,state.position.y,state.position.z],[forward.x,0,forward.z],25,this.vehicle.getBody());
    if(seen&&!this.passing&&obstacle!==undefined&&obstacle<policeConfig.pursuit.passTrigger) {
      this.passing=pursuitPassingLanes(lane,state.position,network).find(candidate=>{
        const projection=projectPath(candidate.path,state.position);
        const end=samplePath(candidate.path,projection.distance+policeConfig.pursuit.passLookAhead);
        const dx=end.x-state.position.x,dz=end.z-state.position.z,length=Math.hypot(dx,dz);
        // Three chassis-width rays check the whole diagonal merge, not just its endpoint.
        for(const side of [-1,0,1]) {
          const width=this.config.sedan.chassisWidth/2+.25;
          const hit=this.physics.castRay([state.position.x+forward.z*width*side,state.position.y,state.position.z-forward.x*width*side],
            [dx/length,0,dz/length],length,this.vehicle.getBody());
          if(hit!==undefined)return false;
        }
        return this.physics.isVehiclePositionClear({...end,y:state.position.y},state.yaw,this.config.sedan);
      })?.id;
    }
    const next=network.lanes.find(l=>l.id===this.next);
    const passing=network.lanes.find(l=>l.id===this.passing);
    const path=passing?[state.position,samplePath(passing.path,projectPath(passing.path,state.position).distance+policeConfig.pursuit.passLookAhead),passing.path.at(-1)!]
      :buildTrafficPath(lane,next,10);
    const projection=projectPath(path,state.position),length=pathLength(path);
    const look=samplePath(path,projection.distance+6+state.speed*.45);
    const limit=getSteeringLimit(state.speed,this.config.sedan.maxSteerAngle,this.config.sedan.highSpeedSteerReduction,this.config.sedan.maxForwardSpeed);
    const pursuit=pursuitSteering(state.yaw,state.position,look,this.config.sedan.wheelBase,limit);
    // Foot targets can stand beside the road: radial distance may never reach
    // stopDistance. Brake before their projection on our drivable path instead.
    const projectedTarget=projectPath(path,target);
    const stopDistance=Math.sqrt(Math.max(9,policeConfig.arrival.stopDistance**2-projectedTarget.lateralError**2));
    const distanceToTarget=Math.hypot(target.x-state.position.x,target.z-state.position.z);
    const canArrive=onFoot&&seen&&projectedTarget.lateralError<policeConfig.arrival.deployDistance-2
      &&(projectedTarget.distance>=projection.distance||distanceToTarget<policeConfig.arrival.deployDistance);
    const approachDistance=canArrive?projectedTarget.distance-projection.distance
      :Math.hypot(target.x-state.position.x,target.z-state.position.z);
    // During vehicle chase keep pursuing; physical obstacle braking below sets the
    // safe tail gap. Only an actual foot-arrival target requests a planned stop.
    let desired:number=(policeConfig.cruiseByLevel[level]??policeConfig.cruiseSpeed)*(seen?policeConfig.pursuit.cruiseMultiplier:1);
    // Pursuit is independent of lights/reservations. Slow for geometry, not traffic permissions.
    desired*=1-.5*Math.abs(pursuit.steering/limit);
    if(canArrive)desired=Math.min(desired,Math.sqrt(12*Math.max(0,approachDistance-stopDistance)));
    if(pursuit.behind||projection.lateralError>5)desired=0;
    // Existing world query sees traffic, other police and the current player car, never self.
    if(obstacle!==undefined)desired=Math.min(desired,Math.sqrt(8*Math.max(0,obstacle-(passing?3:5))));
    const command=speedControl(state.forwardSpeed,desired,seen?policeConfig.pursuit.throttleGain:.3,policeConfig.pursuit.brakeGain);
    this.vehicle.drive({...command,steering:pursuit.steering/limit,reverse:0,handbrake:false},dt);
    this.stalled=state.speed<.2?this.stalled+dt:0;
    if(passing&&projectPath(passing.path,state.position).lateralError<.6){this.laneId=passing.id;this.passing=undefined;this.next=undefined;this.replan=0;}
    else if(!passing&&next&&projection.distance>length-2){this.laneId=next.id;this.next=undefined;this.replan=0;}
  }
  public render(alpha:number):void{this.view.update(this.vehicle.getRenderState(alpha));}
  public transferTo(manager:VehicleManager):VehicleController {
    manager.register(this.vehicle,this.view);this.transferred=true;return this.vehicle;
  }
  public dispose():void{if(!this.transferred){this.view.dispose();this.vehicle.dispose();}}
}
