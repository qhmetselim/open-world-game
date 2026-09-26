import type { Scene } from 'three';
import type { RigidBody } from '@dimforge/rapier3d-compat';
import type { PhysicsWorld, KinematicCharacter } from '../physics/PhysicsWorld';
import { MotionHistory, rotationYaw, yawRotation } from '../physics/MotionHistory';
import type { CombatPoint } from '../combat/CombatState';
import { beginReload, consumeShot, createCombatState, getMuzzle, stepWeapon } from '../combat/CombatState';
import { combatConfig } from '../combat/CombatConfig';
import type { ShotFeedback } from '../combat/CombatController';
import { createHealth, applyDamage } from '../combat/Health';
import { createNpcAppearance, createNpcIdentity } from '../npc/NpcIdentity';
import type { NpcState } from '../npc/NpcTypes';
import { NpcView } from '../render/NpcView';
import type { NpcRenderResources } from '../render/NpcView';
import { CombatView } from '../render/CombatView';
import { createPlayerState } from '../player/PlayerState';
import { approachAngle } from '../player/PlayerMovement';
import { findPedestrianPath } from '../npc/PedestrianPathfinding';
import { findNearestPedestrianNode } from '../city/UrbanMobility';
import type { UrbanMobilityNetwork } from '../city/UrbanMobility';
import { policeConfig as config } from './PoliceConfig';

export type PoliceActivity = 'SEARCH' | 'CHASE' | 'ENGAGE';
const extent=.9;
const weapon={...combatConfig.pistol,damage:config.damage,fireRate:1/config.shotInterval,range:config.engageRange};

export class PoliceOfficer {
  public readonly state:NpcState;
  public activity:PoliceActivity='SEARCH';
  public deadSeconds=0;
  private character:KinematicCharacter|undefined;
  private readonly view:NpcView;
  private readonly gun:CombatView;
  private readonly weapon=createCombatState(weapon);
  private readonly motion=new MotionHistory();
  private verticalSpeed=0;
  private replan=0;
  private path:CombatPoint[]=[];
  private pathGoal:string|undefined;
  private flash=0;
  private readonly aim={x:0,y:0,z:1};
  public constructor(scene:Scene, private readonly physics:PhysicsWorld,resources:NpcRenderResources,id:string,position:CombatPoint) {
    const identity=createNpcIdentity('police',id,'response',config.walkSpeed,config.walkSpeed);
    this.state={id,health:createHealth(),position:{...position},facingYaw:0,currentNodeId:'',destinationNodeId:undefined,pathNodeIds:[],pathIndex:0,
      activity:'idle',tier:'active',idleRemaining:0,tripIndex:0,backgroundElapsed:0,
      appearance:{...createNpcAppearance(identity.appearanceSeed),heightScale:1,widthScale:1,shirtColor:0x213e60,pantsColor:0x17283a,hairColor:0x152e4b,hairStyle:0}};
    this.character=physics.createKinematicCharacter([position.x,position.y+extent,position.z],.58,.32,.02,.65);
    this.view=new NpcView(scene,resources,identity,this.state);this.gun=new CombatView(scene);
    this.weapon.equipped=true;this.weapon.cooldown=config.shotInterval;
    this.motion.reset(position,yawRotation(0));
  }
  public sees(target:CombatPoint,body:RigidBody|undefined):boolean {
    return this.state.health.current>0&&Math.hypot(target.x-this.state.position.x,target.z-this.state.position.z)<config.sightRange
      &&this.physics.hasInteractionLineOfSight({...this.state.position,y:this.state.position.y+1.55},target,this.character?.body,body);
  }
  public step(dt:number,target:CombatPoint,seen:boolean,active:boolean,onFoot:boolean,network:UrbanMobilityNetwork,
    damage:(amount:number)=>void,effect:(shot:ShotFeedback)=>void):void {
    this.flash=Math.max(0,this.flash-dt);
    if(!this.character){this.deadSeconds+=dt;return;}
    const position=this.state.position;
    const distance=Math.hypot(target.x-position.x,target.z-position.z);
    this.activity=active?(seen?(distance<config.engageRange&&onFoot?'ENGAGE':'CHASE'):'SEARCH'):'SEARCH';
    this.weapon.aiming=this.activity==='ENGAGE';stepWeapon(this.weapon,weapon,dt);
    if(this.weapon.magazine===0)beginReload(this.weapon,weapon);
    let waypoint:CombatPoint|undefined;
    this.replan-=dt;
    if(active&&this.activity!=='ENGAGE') {
      if(seen)waypoint=target;
      else {
        if(this.replan<=0) {
          this.replan=config.replanSeconds;
          const start=findNearestPedestrianNode(position,network.pedestrianNodes)?.node;
          const goal=findNearestPedestrianNode(target,network.pedestrianNodes)?.node;
          // Retain progress along long sidewalk edges. Replanning to the same goal
          // from the nearest node would repeatedly send us back to that node.
          if(goal?.id!==this.pathGoal||this.path.length===0) {
            const route=start&&goal?findPedestrianPath(start.id,goal.id,network.pedestrianNodes,network.pedestrianConnections):undefined;
            this.path=(route??[]).map(id=>network.pedestrianNodes.find(n=>n.id===id)!).filter(Boolean).map(n=>({...n.position,y:0}));
            this.pathGoal=goal?.id;
          }
        }
        while(this.path[0]&&Math.hypot(this.path[0].x-position.x,this.path[0].z-position.z)<1)this.path.shift();
        waypoint=this.path[0];
      }
    }
    let vx=0,vz=0;
    if(waypoint){const dx=waypoint.x-position.x,dz=waypoint.z-position.z,l=Math.hypot(dx,dz);if(l>.7){vx=dx/l*config.walkSpeed;vz=dz/l*config.walkSpeed;}}
    const facing=this.activity==='ENGAGE'?Math.atan2(target.x-position.x,target.z-position.z):Math.atan2(vx,vz);
    if(vx||vz||this.activity==='ENGAGE')this.state.facingYaw=approachAngle(this.state.facingYaw,facing,5*dt);
    this.verticalSpeed=Math.max(-25,this.verticalSpeed-24*dt);
    const movement=this.physics.computeCharacterMovement(this.character,[vx*dt,this.verticalSpeed*dt,vz*dt]);
    if(movement.grounded)this.verticalSpeed=0;
    position.x+=movement.translation[0];position.y+=movement.translation[1];position.z+=movement.translation[2];
    this.physics.moveKinematicCharacter(this.character,[position.x,position.y+extent,position.z]);
    this.state.actualSpeed=Math.hypot(movement.translation[0],movement.translation[2])/dt;
    this.state.activity=this.state.actualSpeed>.05?'walking':'idle';this.motion.capture(position,yawRotation(this.state.facingYaw));
    const shoulder={x:position.x,y:position.y+1.5,z:position.z};
    const dx=target.x-shoulder.x,dy=target.y-shoulder.y,dz=target.z-shoulder.z,l=Math.hypot(dx,dy,dz)||1;
    Object.assign(this.aim,{x:dx/l,y:dy/l,z:dz/l});
    // Converge from the visible offset pistol, not from the officer's chest.
    const origin=getMuzzle({...position,y:position.y+1},this.aim);
    const aimLength=Math.hypot(target.x-origin.x,target.y-origin.y,target.z-origin.z)||1;
    Object.assign(this.aim,{x:(target.x-origin.x)/aimLength,y:(target.y-origin.y)/aimLength,z:(target.z-origin.z)/aimLength});
    if(consumeShot(this.weapon,weapon)) {
      const muzzle=getMuzzle({...position,y:position.y+1},this.aim);
      const targets=[{id:'player',position:{...target,y:target.y-1},appearance:{heightScale:1,widthScale:1}}];
      const coverLength=Math.hypot(muzzle.x-shoulder.x,muzzle.y-shoulder.y,muzzle.z-shoulder.z);
      const cover=this.physics.castCombatRay(shoulder,{x:(muzzle.x-shoulder.x)/coverLength,y:(muzzle.y-shoulder.y)/coverLength,z:(muzzle.z-shoulder.z)/coverLength},coverLength,[],this.character.body);
      const hit=cover??this.physics.castCombatRay(muzzle,this.aim,weapon.range,targets,this.character.body);
      if(hit?.npcId==='player')damage(weapon.damage);
      this.flash=combatConfig.flashSeconds;
      effect({from:cover?shoulder:muzzle,to:hit?.position??{x:muzzle.x+this.aim.x*weapon.range,y:muzzle.y+this.aim.y*weapon.range,z:muzzle.z+this.aim.z*weapon.range},hit:hit?.npcId?'npc':hit?'world':undefined});
    }
  }
  public damage(amount:number) {
    const damage=applyDamage(this.state.health,amount),killed=damage>0&&this.state.health.current===0;
    if(killed){this.state.activity='dead';this.state.actualSpeed=0;if(this.character)this.physics.removeKinematicCharacter(this.character);this.character=undefined;}
    return {damage,health:this.state.health.current,killed};
  }
  public render(alpha:number,dt:number):void {
    const transform=this.motion.sample(alpha),state={...this.state,position:transform.position,facingYaw:rotationYaw(transform.rotation)};
    this.view.update(state,dt);
    const gunPlayer=createPlayerState({...state.position,y:state.position.y+1});gunPlayer.facingYaw=Math.PI-state.facingYaw;
    this.gun.update(gunPlayer,{...this.weapon,equipped:state.health.current>0},this.aim,this.flash);
  }
  public dispose():void{if(this.character)this.physics.removeKinematicCharacter(this.character);this.character=undefined;this.view.dispose();this.gun.dispose();}
}
