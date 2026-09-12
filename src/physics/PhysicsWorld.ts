import RAPIER from '@dimforge/rapier3d-compat';
import type { GameConfig } from '../core/Config';
import { CollisionLayer, collisionGroups, QueryGroups } from './CollisionLayers';

export class PhysicsWorld {
  private world: RAPIER.World | undefined;
  private readonly bodies = new Set<RAPIER.RigidBody>();
  private queryPipelineReady = false;

  public async initialize(): Promise<void> {
    await RAPIER.init();
    this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  }

  public createStaticBox(position: readonly [number, number, number], halfExtents: readonly [number, number, number]): RAPIER.RigidBody {
    return this.createStaticCuboid(position, halfExtents, 0);
  }

  public createStaticCuboid(
    position: readonly [number, number, number],
    halfExtents: readonly [number, number, number],
    rotationY: number
  ): RAPIER.RigidBody {
    const world = this.requireWorld();
    const halfAngle = rotationY / 2;
    const body = world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed()
        .setTranslation(...position)
        .setRotation({ x: 0, y: Math.sin(halfAngle), z: 0, w: Math.cos(halfAngle) })
    );
    world.createCollider(RAPIER.ColliderDesc.cuboid(...halfExtents).setCollisionGroups(collisionGroups(CollisionLayer.building)), body);
    this.bodies.add(body);
    return body;
  }

  public createVehicle(
    position: readonly [number, number, number], yaw: number, config: GameConfig['vehicle']['sedan'], traffic = false
  ): VehiclePhysics {
    const world = this.requireWorld();
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(...position).setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) }).setLinearDamping(0.25).setAngularDamping(1.8));
    world.createCollider(RAPIER.ColliderDesc.cuboid(config.chassisWidth / 2, config.chassisHeight / 2, config.chassisLength / 2).setMass(config.mass).setCollisionGroups(collisionGroups(traffic ? CollisionLayer.traffic : CollisionLayer.vehicle)), body);
    const controller = world.createVehicleController(body);
    controller.indexUpAxis = 1;
    controller.setIndexForwardAxis = 2;
    const halfBase = config.wheelBase / 2;
    const halfTrack = config.trackWidth / 2;
    for (const [x, z] of [[-halfTrack, halfBase], [halfTrack, halfBase], [-halfTrack, -halfBase], [halfTrack, -halfBase]] as const) {
      controller.addWheel(new RAPIER.Vector3(x, -config.chassisHeight / 2, z), new RAPIER.Vector3(0, -1, 0), new RAPIER.Vector3(-1, 0, 0), config.suspensionRestLength, config.wheelRadius);
      const index = controller.numWheels() - 1;
      controller.setWheelSuspensionStiffness(index, config.suspensionStiffness);
      controller.setWheelSuspensionCompression(index, config.suspensionDamping);
      controller.setWheelSuspensionRelaxation(index, config.suspensionDamping);
      controller.setWheelMaxSuspensionForce(index, config.mass * 15);
      controller.setWheelFrictionSlip(index, config.grip);
      controller.setWheelSideFrictionStiffness(index, 1);
    }
    this.bodies.add(body);
    return { body, controller };
  }

  public updateVehicle(vehicle: VehiclePhysics, deltaSeconds: number): void { vehicle.controller.updateVehicle(deltaSeconds, undefined, undefined, (collider) => collider.parent()?.handle !== vehicle.body.handle); }
  public removeVehicle(vehicle: VehiclePhysics): void { const world = this.requireWorld(); world.removeVehicleController(vehicle.controller); world.removeRigidBody(vehicle.body); this.bodies.delete(vehicle.body); }

  public isCapsulePositionClear(
    position: readonly [number, number, number],
    capsuleHalfHeight: number,
    capsuleRadius: number,
    excludeBody: RAPIER.RigidBody | undefined
  ): boolean {
    const hit = this.requireWorld().intersectionWithShape(
      new RAPIER.Vector3(...position),
      new RAPIER.Quaternion(0, 0, 0, 1),
      new RAPIER.Capsule(capsuleHalfHeight, capsuleRadius),
      undefined,
      QueryGroups.obstacles,
      undefined,
      excludeBody,
      (collider) => collider.shapeType() !== RAPIER.ShapeType.TriMesh
    );
    return hit === null;
  }

  public createDynamicBox(position: readonly [number, number, number], halfExtents: readonly [number, number, number]): RAPIER.RigidBody {
    const world = this.requireWorld();
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(...position));
    world.createCollider(RAPIER.ColliderDesc.cuboid(...halfExtents).setRestitution(0.15), body);
    this.bodies.add(body);
    return body;
  }

  public createStaticTerrainCollider(
    origin: readonly [number, number],
    chunkSize: number,
    resolution: number,
    heights: Float32Array
  ): RAPIER.RigidBody {
    const world = this.requireWorld();
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(origin[0], 0, origin[1]));
    const { vertices, indices } = createTerrainMeshData(chunkSize, resolution, heights);
    world.createCollider(RAPIER.ColliderDesc.trimesh(vertices, indices).setCollisionGroups(collisionGroups(CollisionLayer.terrain)), body);
    this.bodies.add(body);
    return body;
  }

  public createKinematicCharacter(
    position: readonly [number, number, number],
    capsuleHalfHeight: number,
    capsuleRadius: number,
    controllerOffset: number,
    maxSlopeAngleRadians: number,
    maxStepHeight = 0.25
  ): KinematicCharacter {
    const world = this.requireWorld();
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(...position));
    const collider = world.createCollider(RAPIER.ColliderDesc.capsule(capsuleHalfHeight, capsuleRadius).setCollisionGroups(collisionGroups(CollisionLayer.player)), body);
    const controller = world.createCharacterController(controllerOffset);
    controller.setMaxSlopeClimbAngle(maxSlopeAngleRadians);
    controller.setMinSlopeSlideAngle(maxSlopeAngleRadians + 0.1);
    controller.setSlideEnabled(true);
    controller.enableSnapToGround(0.2);
    controller.enableAutostep(maxStepHeight, 0.2, false);
    this.bodies.add(body);
    return { body, collider, controller };
  }

  public computeCharacterMovement(
    character: KinematicCharacter,
    desiredTranslation: readonly [number, number, number]
  ): CharacterMovementResult {
    this.requireWorld();
    // Rapier 0.20 registers newly-created static colliders in its first step.
    // Moving the capsule beforehand let it enter the ground before its first cast.
    if (!this.queryPipelineReady) return { translation: [0, 0, 0], grounded: false };
    character.controller.computeColliderMovement(
      character.collider,
      new RAPIER.Vector3(desiredTranslation[0], desiredTranslation[1], desiredTranslation[2])
    );
    const movement = character.controller.computedMovement();
    return {
      translation: [movement.x, movement.y, movement.z],
      grounded: character.controller.computedGrounded()
    };
  }

  public setKinematicCharacterPosition(character: KinematicCharacter, position: readonly [number, number, number]): void {
    const translation = new RAPIER.Vector3(position[0], position[1], position[2]);
    character.body.setTranslation(translation, true);
    character.body.setNextKinematicTranslation(translation);
  }

  public moveKinematicCharacter(character: KinematicCharacter, position: readonly [number, number, number]): void {
    character.body.setNextKinematicTranslation(new RAPIER.Vector3(...position));
  }

  public removeKinematicCharacter(character: KinematicCharacter): void {
    const world = this.requireWorld();
    world.removeCharacterController(character.controller);
    world.removeRigidBody(character.body);
    this.bodies.delete(character.body);
  }

  public castRay(
    origin: readonly [number, number, number],
    direction: readonly [number, number, number],
    maxDistance: number,
    excludeBody: RAPIER.RigidBody | undefined
  ): number | undefined {
    const ray = new RAPIER.Ray(
      new RAPIER.Vector3(origin[0], origin[1], origin[2]),
      new RAPIER.Vector3(direction[0], direction[1], direction[2])
    );
    return this.requireWorld().castRay(ray, maxDistance, true, undefined, QueryGroups.camera, undefined, excludeBody)?.timeOfImpact;
  }

  public groundHeight(x: number, z: number, nearY: number): number | undefined {
    const ray = new RAPIER.Ray({ x, y: nearY + 3, z }, { x: 0, y: -1, z: 0 });
    const hit = this.requireWorld().castRay(ray, 6, true, undefined, QueryGroups.ground);
    return hit === null ? undefined : nearY + 3 - hit.timeOfImpact;
  }

  public isVehiclePositionClear(position: { x: number; y: number; z: number }, yaw: number, config: GameConfig['vehicle']['sedan']): boolean {
    return this.requireWorld().intersectionWithShape(position, { x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) },
      new RAPIER.Cuboid(config.chassisWidth / 2 + 0.3, config.chassisHeight / 2, config.chassisLength / 2 + 2),
      undefined, QueryGroups.obstacles) === null;
  }

  public get colliderCount(): number { return this.world?.colliders.len() ?? 0; }
  public get vehicleControllerCount(): number { return this.world?.vehicleControllers.size ?? 0; }

  public removeRigidBody(body: RAPIER.RigidBody): void {
    this.requireWorld().removeRigidBody(body);
    this.bodies.delete(body);
  }

  public step(deltaSeconds: number): void {
    const world = this.requireWorld();
    world.timestep = deltaSeconds;
    world.step();
    this.queryPipelineReady = true;
  }

  public get bodyCount(): number {
    return this.bodies.size;
  }

  public dispose(): void {
    this.world?.free();
    this.world = undefined;
    this.bodies.clear();
    this.queryPipelineReady = false;
  }

  private requireWorld(): RAPIER.World {
    if (this.world === undefined) throw new Error('PhysicsWorld has not been initialized.');
    return this.world;
  }
}

export interface KinematicCharacter {
  readonly body: RAPIER.RigidBody;
  readonly collider: RAPIER.Collider;
  readonly controller: RAPIER.KinematicCharacterController;
}

export interface CharacterMovementResult {
  readonly translation: readonly [number, number, number];
  readonly grounded: boolean;
}
export interface VehiclePhysics { readonly body: RAPIER.RigidBody; readonly controller: RAPIER.DynamicRayCastVehicleController; }

function createTerrainMeshData(
  chunkSize: number,
  resolution: number,
  heights: Float32Array
): { readonly vertices: Float32Array; readonly indices: Uint32Array } {
  const verticesPerSide = resolution + 1;
  const vertices = new Float32Array(verticesPerSide * verticesPerSide * 3);
  const indices = new Uint32Array(resolution * resolution * 6);
  const spacing = chunkSize / resolution;
  let vertexOffset = 0;

  for (let z = 0; z < verticesPerSide; z += 1) {
    for (let x = 0; x < verticesPerSide; x += 1) {
      vertices[vertexOffset] = x * spacing;
      vertices[vertexOffset + 1] = heights[z * verticesPerSide + x] ?? 0;
      vertices[vertexOffset + 2] = z * spacing;
      vertexOffset += 3;
    }
  }

  let indexOffset = 0;
  for (let z = 0; z < resolution; z += 1) {
    for (let x = 0; x < resolution; x += 1) {
      const lowerLeft = z * verticesPerSide + x;
      const lowerRight = lowerLeft + 1;
      const upperLeft = lowerLeft + verticesPerSide;
      const upperRight = upperLeft + 1;
      indices[indexOffset] = lowerLeft;
      indices[indexOffset + 1] = upperLeft;
      indices[indexOffset + 2] = lowerRight;
      indices[indexOffset + 3] = lowerRight;
      indices[indexOffset + 4] = upperLeft;
      indices[indexOffset + 5] = upperRight;
      indexOffset += 6;
    }
  }

  return { vertices, indices };
}
