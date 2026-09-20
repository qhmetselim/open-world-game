import { describe, expect, it, vi } from 'vitest';
import { Scene, Vector3 } from 'three';
import { VehicleView } from '../render/VehicleView';
import { defaultGameConfig } from '../core/Config';
import { InputManager } from '../input/InputManager';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { VehicleController } from './VehicleController';

function keyEvent(type: 'keydown' | 'keyup', code: string): KeyboardEvent {
  return Object.assign(new Event(type), { code }) as KeyboardEvent;
}

async function createDrivingTestVehicle(yaw = 0) {
  const physics = new PhysicsWorld();
  await physics.initialize();
  physics.createStaticBox([0, -0.5, 0], [100, 0.5, 100]);
  const create = vi.spyOn(physics, 'createVehicle');
  const vehicle = new VehicleController(defaultGameConfig.vehicle, physics, 'test:sedan', { x: 0, y: 1.45, z: 0 }, yaw);
  vehicle.initialize();
  const target = new EventTarget();
  const input = new InputManager(target as unknown as Window);
  const rig = create.mock.results[0]!.value as ReturnType<PhysicsWorld['createVehicle']>; create.mockRestore();
  return { physics, input, target, vehicle, rig };
}

function step(vehicle: VehicleController, physics: PhysicsWorld, input: InputManager, frames: number): void {
  for (let frame = 0; frame < frames; frame += 1) {
    vehicle.fixedUpdate(input, 1 / 60);
    physics.step(1 / 60);
    vehicle.syncFromPhysics();
  }
}

describe('official Rapier raycast vehicle integration', () => {
  it.each([['KeyD', 1, false], ['KeyA', -1, false], ['KeyD', 1, true], ['KeyA', -1, true]] as const)(
    '%s at a rotated heading, reverse=%s: input, actual wheel, visual wheel and chassis agree', async (key, sign, reverse) => {
      const yaw = Math.PI / 2;
      const { physics, input, target, vehicle, rig } = await createDrivingTestVehicle(yaw);
      const scene = new Scene(), view = new VehicleView(scene, defaultGameConfig.vehicle.sedan);
      const up = new Vector3(0,1,0);
      const startForward = new Vector3(Math.sin(yaw),0,Math.cos(yaw));
      const driverRight = startForward.clone().cross(up);
      step(vehicle,physics,input,60);
      const start = new Vector3().copy(vehicle.getState().position);
      target.dispatchEvent(keyEvent('keydown', reverse ? 'KeyS' : 'KeyW'));
      target.dispatchEvent(keyEvent('keydown', key));
      step(vehicle,physics,input,120);
      const state = vehicle.getState(); view.update(state);
      expect(state.steering * sign).toBeGreaterThan(.01);
      expect(rig.controller.wheelSteering(0)! * sign).toBeLessThan(-.01);
      const wheelPivot = view.group.children[2]!;
      expect(wheelPivot.rotation.y).toBeCloseTo(rig.controller.wheelSteering(0)!,5);
      // Local +Z rotated around +Y: driver-right is local -X, irrespective of reverse.
      expect(new Vector3(0,0,1).applyQuaternion(wheelPivot.quaternion).x * sign).toBeLessThan(-.01);
      const forward = new Vector3(0,0,1).applyQuaternion(rig.body.rotation());
      expect(forward.dot(driverRight) * sign * (reverse ? -1 : 1)).toBeGreaterThan(.02);
      const displacement = new Vector3().copy(state.position).sub(start);
      expect(displacement.dot(startForward) * (reverse ? -1 : 1)).toBeGreaterThan(.2);
      view.dispose(); vehicle.dispose(); input.dispose(); physics.dispose();
    });
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

  it('physical D turns a +Z-forward sedan toward driver RIGHT (-X), with positive telemetry', async () => {
    const { physics, input, target, vehicle } = await createDrivingTestVehicle();
    target.dispatchEvent(keyEvent('keydown', 'KeyW'));
    target.dispatchEvent(keyEvent('keydown', 'KeyD'));
    step(vehicle, physics, input, 180);
    target.dispatchEvent(keyEvent('keyup', 'KeyD'));
    target.dispatchEvent(keyEvent('keyup', 'KeyW'));
    expect(vehicle.getState().steering).toBeGreaterThan(0);
    expect(vehicle.getState().yaw).toBeLessThan(-.01);
    expect(vehicle.getState().position.x).toBeLessThan(-.1);
    vehicle.dispose();
    input.dispose();
    physics.dispose();
  });

  it('physical A turns a +Z-forward sedan toward driver LEFT (+X), with negative telemetry', async () => {
    const { physics, input, target, vehicle } = await createDrivingTestVehicle();
    target.dispatchEvent(keyEvent('keydown', 'KeyW'));
    target.dispatchEvent(keyEvent('keydown', 'KeyA'));
    step(vehicle, physics, input, 180);
    target.dispatchEvent(keyEvent('keyup', 'KeyA'));
    target.dispatchEvent(keyEvent('keyup', 'KeyW'));
    expect(vehicle.getState().steering).toBeLessThan(0);
    expect(vehicle.getState().yaw).toBeGreaterThan(.01);
    expect(vehicle.getState().position.x).toBeGreaterThan(.1);
    vehicle.dispose();
    input.dispose();
    physics.dispose();
  });
});
