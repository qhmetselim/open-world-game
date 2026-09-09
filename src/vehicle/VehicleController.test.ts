import { describe, expect, it } from 'vitest';
import { defaultGameConfig } from '../core/Config';
import { InputManager } from '../input/InputManager';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { VehicleController } from './VehicleController';

function keyEvent(type: 'keydown' | 'keyup', code: string): KeyboardEvent {
  return Object.assign(new Event(type), { code }) as KeyboardEvent;
}

async function createDrivingTestVehicle(): Promise<{ physics: PhysicsWorld; input: InputManager; target: EventTarget; vehicle: VehicleController }> {
  const physics = new PhysicsWorld();
  await physics.initialize();
  physics.createStaticBox([0, -0.5, 0], [100, 0.5, 100]);
  const vehicle = new VehicleController(defaultGameConfig.vehicle, physics, 'test:sedan', { x: 0, y: 1.45, z: 0 }, 0);
  vehicle.initialize();
  const target = new EventTarget();
  const input = new InputManager(target as unknown as Window);
  return { physics, input, target, vehicle };
}

function step(vehicle: VehicleController, physics: PhysicsWorld, input: InputManager, frames: number): void {
  for (let frame = 0; frame < frames; frame += 1) {
    vehicle.fixedUpdate(input, 1 / 60);
    physics.step(1 / 60);
    vehicle.syncFromPhysics();
  }
}

describe('official Rapier raycast vehicle integration', () => {
  it('creates four wheels, contacts terrain, accelerates, brakes, reverses, and disposes cleanly', async () => {
    const { physics, input, target, vehicle } = await createDrivingTestVehicle();
    step(vehicle, physics, input, 30);
    expect(vehicle.getState().wheelContactCount).toBeGreaterThan(0);
    target.dispatchEvent(keyEvent('keydown', 'KeyW'));
    step(vehicle, physics, input, 120);
    target.dispatchEvent(keyEvent('keyup', 'KeyW'));
    const forwardSpeed = vehicle.getState().speed;
    expect(forwardSpeed).toBeGreaterThan(0.1);
    target.dispatchEvent(keyEvent('keydown', 'KeyS'));
    step(vehicle, physics, input, 100);
    target.dispatchEvent(keyEvent('keyup', 'KeyS'));
    expect(vehicle.getState().speed).toBeLessThan(forwardSpeed);
    target.dispatchEvent(keyEvent('keydown', 'KeyS'));
    step(vehicle, physics, input, 100);
    target.dispatchEvent(keyEvent('keyup', 'KeyS'));
    expect(Math.abs(vehicle.getState().forwardSpeed)).toBeGreaterThan(0.05);
    vehicle.dispose();
    expect(physics.bodyCount).toBe(1);
    input.dispose();
    physics.dispose();
  });

  it('keeps the chassis queryable and reset clears velocity without duplicating the body', async () => {
    const { physics, input, target, vehicle } = await createDrivingTestVehicle();
    target.dispatchEvent(keyEvent('keydown', 'KeyW'));
    step(vehicle, physics, input, 60);
    target.dispatchEvent(keyEvent('keyup', 'KeyW'));
    expect(physics.bodyCount).toBe(2);
    vehicle.reset(() => 0);
    expect(vehicle.getState().speed).toBeLessThan(0.01);
    expect(physics.bodyCount).toBe(2);
    vehicle.dispose();
    input.dispose();
    physics.dispose();
  });
});
