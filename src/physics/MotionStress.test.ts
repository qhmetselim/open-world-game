import { describe, expect, it } from 'vitest';
import { Scene } from 'three';
import { defaultGameConfig as config } from '../core/Config';
import { FixedStepAccumulator } from '../core/GameLoop';
import { PhysicsWorld } from './PhysicsWorld';
import { PlayerController } from '../player/PlayerController';
import { VehicleController } from '../vehicle/VehicleController';
import { TrafficManager } from '../traffic/TrafficManager';
import { InputManager } from '../input/InputManager';
import { getThirdPersonTarget, smoothCameraTarget } from '../render/ThirdPersonCameraMath';
import { assertFinitePhysics } from './PhysicsHealth';
import type { UrbanMobilityNetwork } from '../city/UrbanMobility';

const basis = { forward: { x: 0, z: 1 }, right: { x: -1, z: 0 } };
function press(target: EventTarget, code: string, down: boolean) { target.dispatchEvent(Object.assign(new Event(down ? 'keydown' : 'keyup'), { code })); }
const network: UrbanMobilityNetwork = { lanes: [{ id: 'test-lane', roadId: 'test-road', direction: 'forward', laneIndex: 0, roadClass: 'local', speedMetadata: 30, startNodeId: 'a', endNodeId: 'b', path: [{ x: 30, z: 40 }, { x: 30, z: 200 }] }], laneConnections: [], intersections: [], pedestrianNodes: [], pedestrianConnections: [], crossings: [] };

describe('fixed physics stress acceptance', () => {
  it('walks uphill and downhill on a 15 degree terrain slope but rejects a 60 degree ascent', async () => {
    for (const [angle, downhill] of [[15, false], [15, true], [60, false]] as const) {
      const physics = new PhysicsWorld(); await physics.initialize();
      const grade = Math.tan(angle * Math.PI / 180);
      const height = (_x: number, z: number) => Math.max(0, z - 2) * grade;
      const heights = new Float32Array(33 * 33);
      for (let z = 0; z <= 32; z++) for (let x = 0; x <= 32; x++) heights[z * 33 + x] = height(x - 16, z - 8);
      physics.createStaticTerrainCollider([-16, -8], 32, 32, heights);
      const target = new EventTarget(); const input = new InputManager(target as unknown as Window);
      const start = downhill ? 20 : 0;
      const player = new PlayerController({ ...config.player, spawnPosition: { x: 0, z: start } }, physics); player.initialize(height);
      for (let i = 0; i < 60; i++) { player.fixedUpdate(input, basis, 1 / 60, true, height); physics.step(1 / 60); }
      press(target, downhill ? 'KeyS' : 'KeyW', true); let groundedFrames = 0;
      for (let i = 0; i < 150; i++) {
        player.fixedUpdate(input, basis, 1 / 60, true, height); physics.step(1 / 60);
        if (player.getState().grounded) groundedFrames++;
        assertFinitePhysics('slope', Object.values(player.getState().position));
      }
      const displacement = Math.abs(player.getState().position.z - start);
      if (angle === 15) { expect(displacement).toBeGreaterThan(10); expect(groundedFrames).toBeGreaterThan(120); }
      else expect(displacement).toBeLessThan(3);
      console.info('PLAYER_SLOPE', { angle, downhill, displacement, groundedFrames });
      player.dispose(); input.dispose(); physics.dispose();
    }
  });
  it('keeps 100 jump/land cycles grounded, finite, repeatable and free of body drift', async () => {
    const physics = new PhysicsWorld(); await physics.initialize(); physics.createStaticBox([0, -.5, 0], [30, .5, 30]);
    const inputTarget = new EventTarget(); const input = new InputManager(inputTarget as unknown as Window);
    const player = new PlayerController({ ...config.player, spawnPosition: { x: 0, z: 0 } }, physics); player.initialize(() => 0);
    for (let i = 0; i < 60; i++) { player.fixedUpdate(input, basis, 1 / 60, true, () => 0); physics.step(1 / 60); }
    const baseY = player.getState().position.y; let minApex = Infinity; let maxApex = 0; let maxCameraDelta = 0;
    let camera = getThirdPersonTarget(player.getState().position, config.camera.targetHeight);
    for (let jump = 0; jump < 100; jump++) {
      press(inputTarget, 'Space', true); let apex = baseY;
      for (let frame = 0; frame < 120; frame++) {
        player.fixedUpdate(input, basis, 1 / 60, true, () => 0); physics.step(1 / 60);
        if (frame === 0) press(inputTarget, 'Space', false);
        const state = player.getState(); apex = Math.max(apex, state.position.y);
        assertFinitePhysics('player', [state.position.y, state.velocity.y]);
        const target = smoothCameraTarget(camera, getThirdPersonTarget(player.getRenderState(.5).position, config.camera.targetHeight), config.camera.targetSmoothing, 1 / 60);
        maxCameraDelta = Math.max(maxCameraDelta, Math.abs(target.y - camera.y)); camera = target;
        if (frame > 75) expect(state.grounded).toBe(true);
      }
      minApex = Math.min(minApex, apex); maxApex = Math.max(maxApex, apex);
      expect(player.getState().position.y).toBeCloseTo(baseY, 3); expect(physics.bodyCount).toBe(2);
    }
    expect(maxApex - minApex).toBeLessThan(.01); expect(maxApex - baseY).toBeGreaterThan(1.2); expect(maxCameraDelta).toBeLessThan(.3);
    console.info('100_JUMPS', { apex: maxApex - baseY, maxCameraDelta, drift: player.getState().position.y - baseY });
    player.dispose(); input.dispose(); physics.dispose();
  });
  it('produces matching player, jump, vehicle and traffic motion at 30/60/120/144 FPS', async () => {
    const results = [];
    for (const fps of [30, 60, 120, 144]) {
      const physics = new PhysicsWorld(); await physics.initialize(); physics.createStaticTerrainCollider([-128, -128], 512, 16, new Float32Array(17 * 17));
      const playerTarget = new EventTarget(); const playerInput = new InputManager(playerTarget as unknown as Window);
      const carTarget = new EventTarget(); const carInput = new InputManager(carTarget as unknown as Window);
      const player = new PlayerController({ ...config.player, spawnPosition: { x: -20, z: 0 } }, physics); player.initialize(() => 0);
      const car = new VehicleController(config.vehicle, physics, 'fps-car', { x: 0, y: 1.1, z: 0 }, 0); car.initialize();
      const traffic = new TrafficManager(new Scene(), physics, { ...config.traffic, maxActive: 1, maxBackground: 1 }, config.vehicle.sedan, 'fps', () => 0);
      const accumulator = new FixedStepAccumulator(); let tick = 0; let apex = 0; let airborne = 0; let speedAtBrake = 0; let brakeStart = 0; let brakeEnd = 0;
      for (let frame = 0; frame < fps * 10; frame++) {
        const count = accumulator.consume(1 / fps, 1 / 60, 5);
        for (let step = 0; step < count; step++) {
          if (tick === 30) { press(playerTarget, 'KeyW', true); press(carTarget, 'KeyW', true); }
          if (tick === 90) press(playerTarget, 'Space', true);
          if (tick === 91) press(playerTarget, 'Space', false);
          if (tick === 300) { press(carTarget, 'KeyW', false); press(carTarget, 'KeyS', true); speedAtBrake = car.getState().speed; brakeStart = car.getState().position.z; }
          if (tick > 300 && brakeEnd === 0 && car.getState().forwardSpeed < .6) brakeEnd = car.getState().position.z;
          player.fixedUpdate(playerInput, basis, 1 / 60, true, () => 0); car.fixedUpdate(carInput, 1 / 60);
          traffic.fixedUpdate(1 / 60, { x: 0, z: 0 }, network, undefined); physics.step(1 / 60); car.syncFromPhysics(); traffic.captureAfterStep();
          apex = Math.max(apex, player.getState().position.y); if (tick >= 90 && !player.getState().grounded) airborne++;
          tick++;
        }
        assertFinitePhysics('render', Object.values(player.getRenderState(accumulator.alpha(1 / 60)).position));
      }
      results.push({ fps, distance: player.getState().position.z, apex, airborne, speedAtBrake, brakingDistance: brakeEnd - brakeStart, trafficProgress: traffic.getStates()[0]!.laneProgress });
      expect(player.getState().position.z).toBeGreaterThan(60);
      traffic.dispose(); car.dispose(); player.dispose(); carInput.dispose(); playerInput.dispose(); physics.dispose();
    }
    for (const result of results) {
      expect({ ...result, fps: 60 }).toEqual({ ...results[0]!, fps: 60 });
    }
    console.info('FPS_COMPARISON', results);
  });
  it('climbs a small curb using autostep but is blocked by a tall wall', async () => {
    const physics = new PhysicsWorld(); await physics.initialize(); physics.createStaticBox([0, -.5, 0], [30, .5, 30]);
    physics.createStaticCuboid([0, .075, 3], [2, .075, 1], 0); physics.createStaticCuboid([0, 2, 9], [2, 2, 1], 0);
    const target = new EventTarget(); const input = new InputManager(target as unknown as Window);
    const player = new PlayerController({ ...config.player, spawnPosition: { x: 0, z: 0 } }, physics); player.initialize(() => 0);
    press(target, 'KeyW', true);
    for (let step = 0; step < 240; step++) { player.fixedUpdate(input, basis, 1 / 60, true, () => 0); physics.step(1 / 60); }
    expect(player.getState().position.z).toBeGreaterThan(5); expect(player.getState().position.z).toBeLessThan(8);
    expect(player.getState().grounded).toBe(true); player.dispose(); input.dispose(); physics.dispose();
  });
});
