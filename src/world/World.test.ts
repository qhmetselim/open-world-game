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

  public createStaticCuboid(): object {
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
  it('projects a spawn query onto a deterministic nearby road heading', () => {
    const world = new World(defaultGameConfig.world, defaultGameConfig.city, defaultGameConfig.building, defaultGameConfig.player.spawnPosition, false);
    const road = world.findNearestRoadSegment(defaultGameConfig.player.spawnPosition);
    expect(road).toBeDefined();
    expect(Math.hypot((road?.x ?? 0) - defaultGameConfig.player.spawnPosition.x, (road?.z ?? 0) - defaultGameConfig.player.spawnPosition.z)).toBeLessThan(80);
    expect(road?.heading).toBeGreaterThanOrEqual(-Math.PI);
    expect(road?.heading).toBeLessThanOrEqual(Math.PI);
    const lane = world.findNearestLane(defaultGameConfig.player.spawnPosition);
    const pedestrianNode = world.findNearestPedestrianNode(defaultGameConfig.player.spawnPosition);
    expect(lane?.lane.id).toMatch(/^lane:/);
    expect(lane?.distance).toBeGreaterThanOrEqual(0);
    expect(world.getLaneById(lane?.lane.id ?? '')?.id).toBe(lane?.lane.id);
    expect(pedestrianNode?.node.id).toMatch(/^ped:/);
    expect(world.getPedestrianConnections(pedestrianNode?.node.id ?? '').length).toBeGreaterThan(0);
  });

  it('keeps runtime chunk and physics resource counts bounded across traversal', () => {
    const physics = new FakePhysicsWorld();
    const scene = new Scene();
    const position = { x: 0, z: 0 };
    const config = {
      ...defaultGameConfig.world,
      activeChunkRadius: 1,
      unloadChunkRadius: 2
    };
    const world = new World(config, defaultGameConfig.city, defaultGameConfig.building, defaultGameConfig.player.spawnPosition, false);
    const focus = { getWorldPosition: () => position };

    world.initialize(scene, physics as unknown as PhysicsWorld, focus);
    const initialDebug = world.getDebugInfo();
    expect(initialDebug.activeChunkCount).toBe(9);
    expect(physics.bodyCount).toBe(initialDebug.activeChunkCount + initialDebug.city.buildingColliderCount);
    world.updateStreaming(focus);
    expect(physics.bodyCount).toBe(initialDebug.activeChunkCount + initialDebug.city.buildingColliderCount);

    for (let chunkX = 1; chunkX <= 10; chunkX += 1) {
      position.x = chunkX * config.chunkSize;
      world.updateStreaming(focus);
    }

    const debug = world.getDebugInfo();
    expect(debug.activeChunkCount).toBeLessThanOrEqual((config.unloadChunkRadius * 2 + 1) ** 2);
    expect(debug.city.activeRoadChunkViewCount).toBeLessThanOrEqual(debug.activeChunkCount);
    expect(debug.city.visibleRoadSegmentCount).toBeGreaterThan(0);
    expect(debug.city.activeLaneCount).toBeGreaterThan(0);
    expect(debug.city.activeSidewalkSegmentCount).toBeGreaterThan(0);
    expect(debug.city.activePedestrianNodeCount).toBeGreaterThan(0);
    expect(debug.city.visibleBuildingCount).toBeGreaterThan(0);
    expect(debug.city.buildingColliderCount).toBe(debug.city.visibleBuildingCount);
    expect(physics.bodyCount).toBe(debug.activeChunkCount + debug.city.buildingColliderCount);
    expect(debug.chunkUnloadCount).toBeGreaterThan(0);

    expect(world.getDebugInfo().city.roadGraphDebugEnabled).toBe(false);
    world.toggleRoadGraphDebug();
    expect(world.getDebugInfo().city.roadGraphDebugEnabled).toBe(true);
    expect(world.getDebugInfo().city.buildingGraphDebugEnabled).toBe(false);
    world.toggleBuildingDebug();
    expect(world.getDebugInfo().city.buildingGraphDebugEnabled).toBe(true);

    world.dispose();
    expect(physics.bodyCount).toBe(0);
    expect(scene.children).toHaveLength(0);
  });
});
