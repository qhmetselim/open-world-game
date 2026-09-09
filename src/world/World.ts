import {
  BoxGeometry,
  GridHelper,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry
} from 'three';
import type { Scene } from 'three';
import { PhysicsRenderSynchronizer } from '../physics/PhysicsWorld';
import type { PhysicsWorld } from '../physics/PhysicsWorld';

export class World {
  private readonly synchronizer = new PhysicsRenderSynchronizer();

  public initialize(scene: Scene, physics: PhysicsWorld): void {
    const ground = new Mesh(
      new PlaneGeometry(240, 240),
      new MeshStandardMaterial({ color: 0x587a4a, roughness: 0.95 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);
    physics.createStaticBox([0, -0.25, 0], [120, 0.25, 120]);

    const grid = new GridHelper(120, 60, 0x365c40, 0x4d704e);
    grid.position.y = 0.012;
    scene.add(grid);

    this.addStaticLandmark(scene, physics, [-8, 2, -6], [2, 2, 2], 0x4f719e);
    this.addStaticLandmark(scene, physics, [6, 3, -5], [2.5, 3, 2], 0xb77c53);
    this.addStaticLandmark(scene, physics, [0, 1.5, 8], [4, 1.5, 1.5], 0x6c8e64);

    this.addDynamicTestBox(scene, physics, [-3, 12, 0], 0xd8a34b);
    this.addDynamicTestBox(scene, physics, [1, 18, 1], 0xbc5952);
    this.addDynamicTestBox(scene, physics, [3, 24, -1], 0x5c8fc2);
  }

  public syncPhysics(): void {
    this.synchronizer.syncFromPhysics();
  }

  private addStaticLandmark(
    scene: Scene,
    physics: PhysicsWorld,
    position: readonly [number, number, number],
    halfExtents: readonly [number, number, number],
    color: number
  ): void {
    const mesh = new Mesh(
      new BoxGeometry(halfExtents[0] * 2, halfExtents[1] * 2, halfExtents[2] * 2),
      new MeshStandardMaterial({ color, roughness: 0.72 })
    );
    mesh.position.set(...position);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    physics.createStaticBox(position, halfExtents);
  }

  private addDynamicTestBox(scene: Scene, physics: PhysicsWorld, position: readonly [number, number, number], color: number): void {
    const mesh = new Mesh(
      new BoxGeometry(1.5, 1.5, 1.5),
      new MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.05 })
    );
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    const body = physics.createDynamicBox(position, [0.75, 0.75, 0.75]);
    this.synchronizer.bind(body, mesh);
  }
}
