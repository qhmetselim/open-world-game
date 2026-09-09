import type { GameConfig } from '../core/Config';
import type { InputManager } from '../input/InputManager';
import type { PhysicsWorld, VehiclePhysics } from '../physics/PhysicsWorld';
import type { StreamingFocus } from '../world/ChunkStreaming';
import { createVehicleState } from './VehicleState';
import type { VehicleState } from './VehicleState';
import { getSteeringLimit, resolveBrakeReverse, vehicleLookAhead } from './VehicleMovement';

export class VehicleController implements StreamingFocus {
  private readonly state: VehicleState;
  private physicsVehicle: VehiclePhysics | undefined;
  public constructor(private readonly config: GameConfig['vehicle'], private readonly physics: PhysicsWorld, id: string, position: {x:number;y:number;z:number}, yaw: number) { this.state = createVehicleState(id, position, yaw); }
  public initialize(): void { this.physicsVehicle = this.physics.createVehicle([this.state.position.x, this.state.position.y, this.state.position.z], this.state.yaw, this.config.sedan); }
  public fixedUpdate(input: InputManager, deltaSeconds: number): void {
    const vehicle = this.requireVehicle(); const body = vehicle.body; const speed = this.state.speed;
    const throttle = Number(input.isActive('moveForward')); const back = resolveBrakeReverse(speed, input.isActive('moveBackward'));
    const steerTarget = Number(input.isActive('moveRight')) - Number(input.isActive('moveLeft'));
    this.state.steering += (steerTarget * getSteeringLimit(speed, this.config.sedan.maxSteerAngle, this.config.sedan.highSpeedSteerReduction, this.config.sedan.maxForwardSpeed) - this.state.steering) * Math.min(1, this.config.sedan.steerResponse * deltaSeconds);
    this.state.throttle = throttle; this.state.brake = back.brake + Number(input.isActive('jump'));
    for (let i = 0; i < 4; i += 1) { vehicle.controller.setWheelEngineForce(i, i >= 2 ? throttle * this.config.sedan.engineForce - back.reverse * this.config.sedan.reverseForce : 0); vehicle.controller.setWheelBrake(i, this.state.brake * this.config.sedan.brakeForce); vehicle.controller.setWheelSteering(i, i < 2 ? this.state.steering : 0); vehicle.controller.setWheelFrictionSlip(i, input.isActive('jump') && i >= 2 ? this.config.sedan.handbrakeGrip : this.config.sedan.grip); }
    this.physics.updateVehicle(vehicle, deltaSeconds);
    const velocity = body.linvel(); const translation = body.translation(); const rotation = body.rotation();
    this.state.position = { x: translation.x, y: translation.y, z: translation.z }; this.state.velocity = { x: velocity.x, y: velocity.y, z: velocity.z }; this.state.speed = Math.hypot(velocity.x, velocity.z); this.state.yaw = Math.atan2(2 * (rotation.w * rotation.y + rotation.x * rotation.z), 1 - 2 * (rotation.y * rotation.y + rotation.z * rotation.z));
    this.state.wheelContactCount = Array.from({length:4}, (_,i) => vehicle.controller.wheelContactPoint(i)).filter(Boolean).length;
  }
  public setOccupied(value: boolean): void { this.state.occupied = value; this.state.driverId = value ? 'player:prototype' : undefined; }
  public getState(): VehicleState { return this.state; }
  public getWorldPosition(): {x:number;z:number} { return vehicleLookAhead(this.state.position, this.state.velocity, this.config.recovery.streamingLookAhead); }
  public getBody() { return this.physicsVehicle?.body; }
  public reset(getHeight: (x:number,z:number)=>number): void { const vehicle=this.requireVehicle(); const y=getHeight(this.state.position.x,this.state.position.z)+this.config.sedan.chassisHeight+this.config.sedan.wheelRadius+this.config.sedan.suspensionRestLength; vehicle.body.setTranslation({x:this.state.position.x,y,z:this.state.position.z},true); vehicle.body.setRotation({x:0,y:0,z:0,w:1},true); vehicle.body.setLinvel({x:0,y:0,z:0},true); vehicle.body.setAngvel({x:0,y:0,z:0},true); }
  public dispose(): void { if(this.physicsVehicle) this.physics.removeVehicle(this.physicsVehicle); this.physicsVehicle=undefined; }
  private requireVehicle(): VehiclePhysics { if(!this.physicsVehicle) throw new Error('Vehicle has not been initialized.'); return this.physicsVehicle; }
}
