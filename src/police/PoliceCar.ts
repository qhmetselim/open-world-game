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
import { nextChaseLane } from './PolicePlanner';
import { policeConfig } from './PoliceConfig';

export class PoliceCar {
  public readonly vehicle:VehicleController;
  public activity:'SEARCH'|'CHASE'='SEARCH';
  public stalled=0;
  private readonly view:PoliceVehicleView;
  private next:string|undefined;
  private replan=0;
  public constructor(scene:Scene,private readonly physics:PhysicsWorld,private readonly config:GameConfig['vehicle'],id:string,
    position:CombatPoint,yaw:number,public laneId:string) {
    this.vehicle=new VehicleController(config,physics,id,position,yaw);this.vehicle.initialize();
    this.view=new PoliceVehicleView(scene,config.sedan);
  }
  public step(dt:number,target:CombatPoint,active:boolean,seen:boolean,network:UrbanMobilityNetwork):void {
    this.activity=seen?'CHASE':'SEARCH';
    const state=this.vehicle.getState(),lane=network.lanes.find(l=>l.id===this.laneId);
    if(!active||!lane){this.vehicle.idleFixedUpdate(dt);return;}
    this.replan-=dt;
    if(this.replan<=0&&!this.next){this.next=nextChaseLane(lane.id,target,network);this.replan=policeConfig.replanSeconds;}
    const next=network.lanes.find(l=>l.id===this.next);
    const path=buildTrafficPath(lane,next,10),projection=projectPath(path,state.position),length=pathLength(path);
    const look=samplePath(path,projection.distance+6+state.speed*.45);
    const limit=getSteeringLimit(state.speed,this.config.sedan.maxSteerAngle,this.config.sedan.highSpeedSteerReduction,this.config.sedan.maxForwardSpeed);
    const pursuit=pursuitSteering(state.yaw,state.position,look,this.config.sedan.wheelBase,limit);
    let desired=Math.min(policeConfig.cruiseSpeed,Math.sqrt(12*Math.max(0,Math.hypot(target.x-state.position.x,target.z-state.position.z)-8)));
    if(pursuit.behind||projection.lateralError>5)desired=0;
    // Existing world query sees traffic, other police and the current player car, never self.
    const forward={x:Math.sin(state.yaw),z:Math.cos(state.yaw)};
    const obstacle=this.physics.castRay([state.position.x,state.position.y,state.position.z],[forward.x,0,forward.z],25,this.vehicle.getBody());
    if(obstacle!==undefined)desired=Math.min(desired,Math.sqrt(8*Math.max(0,obstacle-5)));
    const command=speedControl(state.forwardSpeed,desired,.3,.6);
    this.vehicle.drive({...command,steering:pursuit.steering/limit,reverse:0,handbrake:false},dt);
    this.stalled=state.speed<.2?this.stalled+dt:0;
    if(next&&projection.distance>length-2){this.laneId=next.id;this.next=undefined;this.replan=0;}
  }
  public render(alpha:number):void{this.view.update(this.vehicle.getRenderState(alpha));}
  public dispose():void{this.view.dispose();this.vehicle.dispose();}
}
