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
