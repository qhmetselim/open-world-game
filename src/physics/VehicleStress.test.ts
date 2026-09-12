import { expect, it } from 'vitest';
import { defaultGameConfig as config } from '../core/Config';
import { InputManager } from '../input/InputManager';
import { VehicleController } from '../vehicle/VehicleController';
import { PhysicsWorld } from './PhysicsWorld';
import { assertFinitePhysics } from './PhysicsHealth';
import { FixedStepAccumulator } from '../core/GameLoop';

it('survives acceleration, repeated steering, handbrake, reversing and contact on a real slope', async () => {
  const physics = new PhysicsWorld(); await physics.initialize();
  const heights = new Float32Array(17 * 17);
  for (let z = 0; z <= 16; z++) for (let x = 0; x <= 16; x++) heights[z * 17 + x] = (-256 + z * 32) * .06;
  physics.createStaticTerrainCollider([-256, -256], 512, 16, heights);
  const vehicle = new VehicleController(config.vehicle, physics, 'stress', { x: 0, y: 1.1, z: 0 }, 0); vehicle.initialize();
  const target = new EventTarget(); const input = new InputManager(target as unknown as Window);
  const key = (code: string, down: boolean) => target.dispatchEvent(Object.assign(new Event(down ? 'keydown' : 'keyup'), { code }));
  let peakSpeed = 0; let maxYawRate = 0; let minimumUp = 1;
  const tick = () => {
    vehicle.fixedUpdate(input, 1 / 60); physics.step(1 / 60); vehicle.syncFromPhysics();
    const s = vehicle.getState(); const q = s.rotation;
    peakSpeed = Math.max(peakSpeed, s.speed); maxYawRate = Math.max(maxYawRate, Math.abs(vehicle.getBody()!.angvel().y));
    minimumUp = Math.min(minimumUp, 1 - 2 * (q.x ** 2 + q.z ** 2));
    expect(s.suspensionLengths).toHaveLength(4);
    assertFinitePhysics('vehicle-stress', [...Object.values(s.position), ...Object.values(q), ...Object.values(s.velocity), ...(s.suspensionLengths ?? [])]);
    expect(s.position.y - s.position.z * .06).toBeGreaterThan(.3);
  };
  for (let i = 0; i < 60; i++) tick(); key('KeyW', true);
  for (let i = 0; i < 900; i++) tick();
  expect(peakSpeed).toBeGreaterThan(9);
  for (let turn = 0; turn < 6; turn++) {
    const code = turn % 2 ? 'KeyA' : 'KeyD'; key(code, true); for (let i = 0; i < 18; i++) tick(); key(code, false); for (let i = 0; i < 30; i++) tick();
  }
  key('KeyW', false); const beforeBrake = vehicle.getState().speed; key('Space', true);
  for (let i = 0; i < 240; i++) tick(); key('Space', false);
  expect(vehicle.getState().speed).toBeLessThan(beforeBrake * .2);
  key('KeyS', true); for (let i = 0; i < 180; i++) tick(); key('KeyS', false);
  expect(vehicle.getState().forwardSpeed).toBeLessThan(-1); expect(minimumUp).toBeGreaterThan(.7); expect(maxYawRate).toBeLessThan(2);
  const q = vehicle.getState().yaw; const p = vehicle.getState().position;
  physics.createStaticCuboid([p.x + Math.sin(q) * 8, p.y + 2, p.z + Math.cos(q) * 8], [4, 3, 1], q);
  key('KeyW', true); for (let i = 0; i < 600; i++) tick();
  expect(vehicle.getState().speed).toBeLessThan(1);
  console.info('SEDAN_STRESS', { peakSpeed, maxYawRate, minimumUp, finalSpeed: vehicle.getState().speed });
  vehicle.dispose(); expect(physics.vehicleControllerCount).toBe(0); expect(physics.bodyCount).toBe(2); input.dispose(); physics.dispose();
});

it('bounds real-physics impulses and displacement during repeated 100ms render spikes', async () => {
  const physics = new PhysicsWorld(); await physics.initialize(); physics.createStaticTerrainCollider([-128, -128], 256, 8, new Float32Array(81));
  const car = new VehicleController(config.vehicle, physics, 'spikes', { x: 0, y: 1.1, z: 0 }, 0); car.initialize();
  const target = new EventTarget(); const input = new InputManager(target as unknown as Window);
  target.dispatchEvent(Object.assign(new Event('keydown'), { code: 'KeyW' }));
  const accumulator = new FixedStepAccumulator(); let previous = 0;
  for (let frame = 0; frame < 240; frame++) {
    const steps = accumulator.consume(frame % 4 === 2 ? .1 : .016, config.physics.fixedTimeStep, config.physics.maxSubSteps);
    for (let step = 0; step < steps; step++) { car.fixedUpdate(input, 1 / 60); physics.step(1 / 60); car.syncFromPhysics(); }
    const state = car.getState(); assertFinitePhysics('spike', [...Object.values(state.position), ...Object.values(state.velocity)]);
    expect(Math.abs(state.position.z - previous)).toBeLessThan(2); previous = state.position.z;
  }
  car.dispose(); input.dispose(); physics.dispose();
});

it('filters the player and controlled vehicle from camera rays while retaining building obstacles', async () => {
  const physics = new PhysicsWorld(); await physics.initialize();
  const player = physics.createKinematicCharacter([0, 1, 2], .6, .4, .02, Math.PI / 4);
  const car = physics.createVehicle([0, 1, 5], 0, config.vehicle.sedan);
  physics.createStaticCuboid([0, 1, 10], [2, 2, .5], 0); physics.step(1 / 60);
  expect(physics.castRay([0, 1, 0], [0, 0, 1], 20, car.body)).toBeCloseTo(9.5);
  expect(physics.castRay([0, 1, 0], [0, 0, 1], 20, player.body)).toBeLessThan(5);
  physics.removeKinematicCharacter(player); physics.removeVehicle(car); physics.dispose();
});
