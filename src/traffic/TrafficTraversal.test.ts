import { Scene } from 'three';
import { describe, expect, it } from 'vitest';
import { defaultGameConfig } from '../core/Config';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { World } from '../world/World';
import { TrafficManager } from './TrafficManager';

describe('traffic streamed traversal', () => {
  it('keeps real Rapier traffic controllers and the streamed city bounded across ten chunks', async () => {
    const physics = new PhysicsWorld();
    await physics.initialize();
    const worldConfig = { ...defaultGameConfig.world, activeChunkRadius: 1, unloadChunkRadius: 2 };
    const buildingConfig = { ...defaultGameConfig.building, urbanOccupancy: 0 };
    const world = new World(worldConfig, defaultGameConfig.city, buildingConfig, defaultGameConfig.player.spawnPosition, false);
    const scene = new Scene();
    const focus = { x: 0, z: 0, getWorldPosition: () => ({ x: focus.x, z: focus.z }) };
    world.initialize(scene, physics, focus);
    const traffic = new TrafficManager(
      scene,
      physics,
      { ...defaultGameConfig.traffic, maxActive: 4, maxBackground: 16, activationBudget: 2 },
      defaultGameConfig.vehicle.sedan,
      worldConfig.seed,
      (x, z) => world.getTerrainHeight(x, z)
    );
    let peakTrafficControllers = 0;
    let peakPhysicsBodies = physics.bodyCount;
    let peakChunks = world.getDebugInfo().activeChunkCount;

    for (let step = 0; step <= 10; step += 1) {
      focus.z = step * worldConfig.chunkSize;
      world.updateStreaming(focus);
      const network = world.getPedestrianNetworkAround(focus);
      for (let frame = 0; frame < 60; frame += 1) {
        traffic.fixedUpdate(1 / 60, focus, network, undefined);
        physics.step(1 / 60);
      }
      const trafficDebug = traffic.getDebugInfo();
      peakTrafficControllers = Math.max(peakTrafficControllers, trafficDebug.controllerCount);
      peakPhysicsBodies = Math.max(peakPhysicsBodies, physics.bodyCount);
      peakChunks = Math.max(peakChunks, world.getDebugInfo().activeChunkCount);
      expect(trafficDebug.activeCount).toBeLessThanOrEqual(4);
      expect(trafficDebug.backgroundCount).toBeLessThanOrEqual(16);
      expect(trafficDebug.controllerCount).toBe(trafficDebug.activeCount);
    }

    expect(peakTrafficControllers).toBeGreaterThan(0);
    expect(peakTrafficControllers).toBeLessThanOrEqual(4);
    expect(peakChunks).toBeLessThanOrEqual((worldConfig.unloadChunkRadius * 2 + 1) ** 2);
    expect(peakPhysicsBodies).toBeLessThanOrEqual((worldConfig.unloadChunkRadius * 2 + 1) ** 2 + 4);
    traffic.dispose();
    expect(physics.bodyCount).toBeLessThanOrEqual((worldConfig.unloadChunkRadius * 2 + 1) ** 2);
    world.dispose();
    physics.dispose();
  }, 30_000);
});
