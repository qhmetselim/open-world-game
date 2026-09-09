import RAPIER from '@dimforge/rapier3d-compat';
import type { Object3D } from 'three';

export class PhysicsWorld {
  private world: RAPIER.World | undefined;
  private readonly bodies = new Set<RAPIER.RigidBody>();

  public async initialize(): Promise<void> {
    await RAPIER.init();
    this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  }

  public createStaticBox(position: readonly [number, number, number], halfExtents: readonly [number, number, number]): RAPIER.RigidBody {
    const world = this.requireWorld();
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(...position));
    world.createCollider(RAPIER.ColliderDesc.cuboid(...halfExtents), body);
    this.bodies.add(body);
    return body;
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
    world.createCollider(RAPIER.ColliderDesc.trimesh(vertices, indices), body);
    this.bodies.add(body);
    return body;
  }

  public createKinematicCharacter(
    position: readonly [number, number, number],
    capsuleHalfHeight: number,
    capsuleRadius: number,
    controllerOffset: number,
    maxSlopeAngleRadians: number
  ): KinematicCharacter {
    const world = this.requireWorld();
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(...position));
    const collider = world.createCollider(RAPIER.ColliderDesc.capsule(capsuleHalfHeight, capsuleRadius), body);
    const controller = world.createCharacterController(controllerOffset);
    controller.setMaxSlopeClimbAngle(maxSlopeAngleRadians);
    controller.setMinSlopeSlideAngle(maxSlopeAngleRadians + 0.1);
    controller.setSlideEnabled(true);
    controller.enableSnapToGround(0.2);
    this.bodies.add(body);
    return { body, collider, controller };
  }

  public computeCharacterMovement(
    character: KinematicCharacter,
    desiredTranslation: readonly [number, number, number]
  ): CharacterMovementResult {
    this.requireWorld();
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
    return this.requireWorld().castRay(ray, maxDistance, true, undefined, undefined, undefined, excludeBody)?.timeOfImpact;
  }

  public removeRigidBody(body: RAPIER.RigidBody): void {
    this.requireWorld().removeRigidBody(body);
    this.bodies.delete(body);
  }

  public step(deltaSeconds: number): void {
    const world = this.requireWorld();
    world.timestep = deltaSeconds;
    world.step();
  }

  public get bodyCount(): number {
    return this.bodies.size;
  }

  public dispose(): void {
    this.world?.free();
    this.world = undefined;
    this.bodies.clear();
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

export class PhysicsRenderSynchronizer {
  private readonly bindings: Array<{ readonly body: RAPIER.RigidBody; readonly object: Object3D }> = [];

  public bind(body: RAPIER.RigidBody, object: Object3D): void {
    this.bindings.push({ body, object });
  }

  public syncFromPhysics(): void {
    for (const { body, object } of this.bindings) {
      const translation = body.translation();
      const rotation = body.rotation();
      object.position.set(translation.x, translation.y, translation.z);
      object.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);
    }
  }
}
