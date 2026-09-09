import { Scene } from 'three';
import { describe, expect, it } from 'vitest';
import { defaultGameConfig } from '../core/Config';
import { InputManager } from '../input/InputManager';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { World } from '../world/World';
import { VehicleController } from './VehicleController';

function keyEvent(type: 'keydown' | 'keyup', code: string): KeyboardEvent {
  return Object.assign(new Event(type), { code }) as KeyboardEvent;
}

describe('vehicle high-speed streaming traversal', () => {
  it('moves a real Rapier vehicle across ten chunk lengths while streamed resources remain bounded', async () => {
    const physics = new PhysicsWorld();
    await physics.initialize();
    const worldConfig = { ...defaultGameConfig.world, activeChunkRadius: 1, unloadChunkRadius: 2 };
    const quietCity = { ...defaultGameConfig.city, urbanSpawnRadius: -1, urbanChance: 0 };
    const world = new World(worldConfig, quietCity, defaultGameConfig.building, defaultGameConfig.player.spawnPosition, false);
    const initialHeight = world.getTerrainHeight(0, 0);
    const vehicle = new VehicleController(defaultGameConfig.vehicle, physics, 'test:traversal', { x: 0, y: initialHeight + 1.8, z: 0 }, 0);
    vehicle.initialize();
    world.initialize(new Scene(), physics, vehicle);
    const target = new EventTarget();
    const input = new InputManager(target as unknown as Window);
    target.dispatchEvent(keyEvent('keydown', 'KeyW'));
    let peakBodies = physics.bodyCount;
    let peakChunks = world.getDebugInfo().activeChunkCount;
    let travelled = 0;
    for (let frame = 0; frame < 12_000 && travelled < worldConfig.chunkSize * 10; frame += 1) {
      vehicle.fixedUpdate(input, 1 / 60);
      physics.step(1 / 60);
      vehicle.syncFromPhysics();
      if (frame % 6 === 0) world.updateStreaming(vehicle);
      const state = vehicle.getState();
      travelled = Math.hypot(state.position.x, state.position.z);
      peakBodies = Math.max(peakBodies, physics.bodyCount);
      peakChunks = Math.max(peakChunks, world.getDebugInfo().activeChunkCount);
    }
    const debug = world.getDebugInfo();
    expect(travelled).toBeGreaterThanOrEqual(worldConfig.chunkSize * 10);
    expect(vehicle.getState().position.y).toBeGreaterThan(defaultGameConfig.vehicle.recovery.killY);
    expect(peakChunks).toBeLessThanOrEqual((worldConfig.unloadChunkRadius * 2 + 1) ** 2);
    expect(peakBodies).toBeLessThanOrEqual((worldConfig.unloadChunkRadius * 2 + 1) ** 2 + 1);
    expect(debug.activeChunkCount).toBeLessThanOrEqual((worldConfig.unloadChunkRadius * 2 + 1) ** 2);
    target.dispatchEvent(keyEvent('keyup', 'KeyW'));
    target.dispatchEvent(keyEvent('keydown', 'KeyS'));
    for (let frame = 0; frame < 12_000 && travelled > worldConfig.chunkSize * 2; frame += 1) {
      vehicle.fixedUpdate(input, 1 / 60);
      physics.step(1 / 60);
      vehicle.syncFromPhysics();
      if (frame % 6 === 0) world.updateStreaming(vehicle);
      const state = vehicle.getState();
      travelled = Math.hypot(state.position.x, state.position.z);
      peakBodies = Math.max(peakBodies, physics.bodyCount);
    }
    target.dispatchEvent(keyEvent('keyup', 'KeyS'));
    expect(travelled).toBeLessThan(worldConfig.chunkSize * 2);
    expect(physics.bodyCount).toBeLessThanOrEqual((worldConfig.unloadChunkRadius * 2 + 1) ** 2 + 1);
    vehicle.dispose();
    input.dispose();
    world.dispose();
    physics.dispose();
  }, 30_000);
});
