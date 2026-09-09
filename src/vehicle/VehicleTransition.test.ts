import { describe, expect, it } from 'vitest';
import { defaultGameConfig } from '../core/Config';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { PlayerController } from '../player/PlayerController';
import { VehicleController } from './VehicleController';

describe('on-foot vehicle state transition physics', () => {
  it('removes the player capsule on enter and restores exactly one capsule on exit', async () => {
    const physics = new PhysicsWorld();
    await physics.initialize();
    const player = new PlayerController(defaultGameConfig.player, physics);
    player.initialize(() => 0);
    const vehicle = new VehicleController(defaultGameConfig.vehicle, physics, 'test:transition', { x: 3, y: 1.4, z: 0 }, 0);
    vehicle.initialize();
    expect(physics.bodyCount).toBe(2);
    player.suspend();
    vehicle.setOccupied(true);
    expect(player.getPhysicsBody()).toBeUndefined();
    expect(vehicle.getState().occupied).toBe(true);
    expect(physics.bodyCount).toBe(1);
    player.resumeAt({ x: 6, z: 0 }, () => 0);
    vehicle.setOccupied(false);
    expect(player.getPhysicsBody()).toBeDefined();
    expect(vehicle.getState().occupied).toBe(false);
    expect(physics.bodyCount).toBe(2);
    player.dispose();
    vehicle.dispose();
    expect(physics.bodyCount).toBe(0);
    physics.dispose();
  });
});
