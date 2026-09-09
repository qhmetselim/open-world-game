import type { GameConfig } from '../core/Config';
import type { InputManager } from '../input/InputManager';
import type { PhysicsWorld, VehiclePhysics } from '../physics/PhysicsWorld';
import { getVehicleForward } from '../render/VehicleCameraMath';
import type { StreamingFocus } from '../world/ChunkStreaming';
import { getSteeringInput, getSteeringLimit, resolveBrakeReverse, toRapierSteeringAngle, vehicleLookAhead } from './VehicleMovement';
import { createVehicleState } from './VehicleState';
import type { VehicleState } from './VehicleState';

export class VehicleController implements StreamingFocus {
  private readonly state: VehicleState;
  private physicsVehicle: VehiclePhysics | undefined;

  public constructor(
    private readonly config: GameConfig['vehicle'],
    private readonly physics: PhysicsWorld,
    id: string,
    position: { readonly x: number; readonly y: number; readonly z: number },
    yaw: number
  ) {
    this.state = createVehicleState(id, position, yaw);
  }

  public initialize(): void {
    this.physicsVehicle = this.physics.createVehicle(
      [this.state.position.x, this.state.position.y, this.state.position.z],
      this.state.yaw,
      this.config.sedan
    );
    this.syncFromPhysics();
  }

  public fixedUpdate(input: InputManager, deltaSeconds: number): void {
    const throttle = Number(input.isActive('moveForward'));
    const backward = resolveBrakeReverse(this.state.forwardSpeed, input.isActive('moveBackward'));
    const steerTarget = getSteeringInput(input.isActive('moveLeft'), input.isActive('moveRight'));
    const steeringLimit = getSteeringLimit(
      this.state.speed,
      this.config.sedan.maxSteerAngle,
      this.config.sedan.highSpeedSteerReduction,
      this.config.sedan.maxForwardSpeed
    );
    this.state.steering += (steerTarget * steeringLimit - this.state.steering) * Math.min(1, this.config.sedan.steerResponse * deltaSeconds);
    this.state.throttle = throttle;
    this.state.brake = Math.min(1, backward.brake + Number(input.isActive('jump')));
    this.state.reverse = backward.reverse > 0;
    this.state.handbrake = input.isActive('jump');
    this.updateWheelPhysics(backward.reverse, deltaSeconds);
  }

  public idleFixedUpdate(deltaSeconds: number): void {
    this.state.throttle = 0;
    // A parked development vehicle should remain where it was spawned while its suspension settles.
    this.state.brake = 1;
    this.state.reverse = false;
    this.state.handbrake = false;
    this.state.steering += (0 - this.state.steering) * Math.min(1, this.config.sedan.steerResponse * deltaSeconds);
    this.updateWheelPhysics(0, deltaSeconds);
  }

  public syncFromPhysics(): void {
    const vehicle = this.requireVehicle();
    const velocity = vehicle.body.linvel();
    const translation = vehicle.body.translation();
    const rotation = vehicle.body.rotation();
    this.state.position = { x: translation.x, y: translation.y, z: translation.z };
    this.state.rotation = { x: rotation.x, y: rotation.y, z: rotation.z, w: rotation.w };
    this.state.velocity = { x: velocity.x, y: velocity.y, z: velocity.z };
    this.state.speed = Math.hypot(velocity.x, velocity.z);
    this.state.yaw = Math.atan2(
      2 * (rotation.w * rotation.y + rotation.x * rotation.z),
      1 - 2 * (rotation.y * rotation.y + rotation.z * rotation.z)
    );
    const forward = getVehicleForward(this.state.yaw);
    this.state.forwardSpeed = velocity.x * forward.x + velocity.z * forward.z;
    this.state.wheelContactCount = Array.from({ length: 4 }, (_, index) => vehicle.controller.wheelIsInContact(index)).filter(Boolean).length;
    this.state.wheelRotations = [
      vehicle.controller.wheelRotation(0) ?? 0,
      vehicle.controller.wheelRotation(1) ?? 0,
      vehicle.controller.wheelRotation(2) ?? 0,
      vehicle.controller.wheelRotation(3) ?? 0
    ];
  }

  public setOccupied(value: boolean): void {
    this.state.occupied = value;
    this.state.driverId = value ? 'player:prototype' : undefined;
  }

  public getState(): VehicleState {
    return this.state;
  }

  public getWorldPosition(): { x: number; z: number } {
    const lookAhead = Math.min(
      this.config.recovery.maxStreamingLookAhead,
      this.config.recovery.baseStreamingLookAhead + this.state.speed * this.config.recovery.streamingLookAheadSpeedFactor
    );
    return vehicleLookAhead(this.state.position, this.state.velocity, lookAhead);
  }

  public getBody(): VehiclePhysics['body'] | undefined {
    return this.physicsVehicle?.body;
  }

  public reset(getHeight: (x: number, z: number) => number): void {
    const vehicle = this.requireVehicle();
    const y = getHeight(this.state.position.x, this.state.position.z)
      + this.config.sedan.chassisHeight
      + this.config.sedan.wheelRadius
      + this.config.sedan.suspensionRestLength;
    vehicle.body.setTranslation({ x: this.state.position.x, y, z: this.state.position.z }, true);
    vehicle.body.setRotation({ x: 0, y: Math.sin(this.state.yaw / 2), z: 0, w: Math.cos(this.state.yaw / 2) }, true);
    vehicle.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    vehicle.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.syncFromPhysics();
  }

  public dispose(): void {
    if (this.physicsVehicle !== undefined) this.physics.removeVehicle(this.physicsVehicle);
    this.physicsVehicle = undefined;
  }

  private requireVehicle(): VehiclePhysics {
    if (this.physicsVehicle === undefined) throw new Error('Vehicle has not been initialized.');
    return this.physicsVehicle;
  }

  private updateWheelPhysics(reverse: number, deltaSeconds: number): void {
    const vehicle = this.requireVehicle();
    for (let index = 0; index < 4; index += 1) {
      vehicle.controller.setWheelEngineForce(index, index >= 2 ? this.state.throttle * this.config.sedan.engineForce - reverse * this.config.sedan.reverseForce : 0);
      vehicle.controller.setWheelBrake(index, this.state.brake * this.config.sedan.brakeForce);
      vehicle.controller.setWheelSteering(index, index < 2 ? toRapierSteeringAngle(this.state.steering) : 0);
      vehicle.controller.setWheelFrictionSlip(index, this.state.handbrake && index >= 2 ? this.config.sedan.handbrakeGrip : this.config.sedan.grip);
    }
    this.physics.updateVehicle(vehicle, deltaSeconds);
  }
}
