import { Scene } from 'three';
import { describe, expect, it } from 'vitest';
import { defaultGameConfig } from '../core/Config';
import type { PhysicsWorld } from '../physics/PhysicsWorld';
import { World } from './World';

class FakePhysicsWorld {
  public bodyCount = 0;
  public createdCount = 0;
  public removedCount = 0;

  public createStaticTerrainCollider(): object {
    this.bodyCount += 1;
    this.createdCount += 1;
    return {};
  }

  public removeRigidBody(): void {
    this.bodyCount -= 1;
    this.removedCount += 1;
  }
}

describe('World streaming lifecycle', () => {
  it('keeps runtime chunk and physics resource counts bounded across traversal', () => {
    const physics = new FakePhysicsWorld();
    const scene = new Scene();
    const position = { x: 0, z: 0 };
    const config = {
      ...defaultGameConfig.world,
      activeChunkRadius: 1,
      unloadChunkRadius: 2
    };
    const world = new World(config, defaultGameConfig.city, false);
    const focus = { getWorldPosition: () => position };

    world.initialize(scene, physics as unknown as PhysicsWorld, focus);
    expect(world.getDebugInfo().activeChunkCount).toBe(9);
    expect(physics.bodyCount).toBe(9);

    for (let chunkX = 1; chunkX <= 10; chunkX += 1) {
      position.x = chunkX * config.chunkSize;
      world.updateStreaming(focus);
    }

    const debug = world.getDebugInfo();
    expect(debug.activeChunkCount).toBeLessThanOrEqual((config.unloadChunkRadius * 2 + 1) ** 2);
    expect(debug.city.activeRoadChunkViewCount).toBeLessThanOrEqual(debug.activeChunkCount);
    expect(debug.city.visibleRoadSegmentCount).toBeGreaterThan(0);
    expect(physics.bodyCount).toBe(debug.activeChunkCount);
    expect(debug.chunkUnloadCount).toBeGreaterThan(0);

    expect(world.getDebugInfo().city.roadGraphDebugEnabled).toBe(false);
    world.toggleRoadGraphDebug();
    expect(world.getDebugInfo().city.roadGraphDebugEnabled).toBe(true);

    world.dispose();
    expect(physics.bodyCount).toBe(0);
    expect(scene.children).toHaveLength(0);
  });
});
