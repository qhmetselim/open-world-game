import { Scene } from 'three';
import { describe, expect, it } from 'vitest';
import { defaultGameConfig as config } from '../core/Config';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { TrafficManager } from './TrafficManager';
import { validateTrafficSpawn } from './TrafficSpawn';
import { buildTrafficPath, projectPath, reacquireForwardLane } from './TrafficPath';
import { CityLayoutGenerator } from '../city/CityLayoutGenerator';
import { buildUrbanMobilityNetwork } from '../city/UrbanMobility';
import type { UrbanMobilityNetwork, VehicleLane } from '../city/UrbanMobility';
import { assertFinitePhysics } from '../physics/PhysicsHealth';

function lane(id: string, ax: number, az: number, bx: number, bz: number): VehicleLane {
  return { id, roadId: id, direction: 'forward', laneIndex: 0, roadClass: 'local', speedMetadata: 30, startNodeId: `${id}:a`, endNodeId: `${id}:b`, path: [{ x: ax, z: az }, { x: bx, z: bz }] };
}

describe('traffic physics acceptance', () => {
  it('reacquires only nearby forward-connected lanes and rejects opposing or behind paths', () => {
    const forward = lane('forward', 0, 0, 0, 100);
    const opposite = lane('opposite', 0, 100, 0, 0);
    expect(reacquireForwardLane([opposite, forward], { x: .5, z: 50 }, 0)?.id).toBe('forward');
    expect(reacquireForwardLane([forward], { x: 5, z: 50 }, 0)).toBeUndefined();
    expect(reacquireForwardLane([forward], { x: 0, z: 105 }, 0)).toBeUndefined();
    expect(reacquireForwardLane([forward], { x: 0, z: 50 }, Math.PI)).toBeUndefined();
  });
  it('yields four real vehicles at a shared junction and lets every incoming route progress', async () => {
    const physics = new PhysicsWorld(); await physics.initialize(); physics.createStaticBox([0, -.5, 0], [300, .5, 300]); physics.step(1 / 60);
    const incoming = [lane('a:south', 2, -200, 2, 0), lane('a:north', -2, 200, -2, 0), lane('a:west', -200, -2, 0, -2), lane('a:east', 200, 2, 0, 2)];
    const outgoing = [lane('z:north', 2, 0, 2, 200), lane('z:south', -2, 0, -2, -200), lane('z:east', 0, -2, 200, -2), lane('z:west', 0, 2, -200, 2)];
    const network: UrbanMobilityNetwork = { lanes: [...incoming, ...outgoing], intersections: [{ id: 'shared', nodeId: 'shared', position: { x: 0, z: 0 }, incomingLaneIds: incoming.map((l) => l.id), outgoingLaneIds: outgoing.map((l) => l.id), connectedRoadIds: [...incoming, ...outgoing].map((l) => l.roadId) }], laneConnections: incoming.map((l, i) => ({ id: `through:${i}`, incomingLaneId: l.id, outgoingLaneId: outgoing[i]!.id, intersectionId: 'shared', turn: 'straight' })), pedestrianNodes: [], pedestrianConnections: [], crossings: [] };
    const traffic = new TrafficManager(new Scene(), physics, { ...config.traffic, maxActive: 4, maxBackground: 4, activeRadius: 260, despawnRadius: 280, spawnMaxDistance: 190 }, config.vehicle.sedan, 'junction-stress', () => 0);
    let waited = false; let minGap = Infinity;
    for (let step = 0; step < 6000; step++) {
      traffic.fixedUpdate(1 / 60, { x: 0, z: 0 }, network, undefined); physics.step(1 / 60); traffic.captureAfterStep();
      const states = traffic.getStates().filter((s) => s.tier === 'active');
      if (step === 10) expect(states.every((s) => s.laneId.startsWith('a:'))).toBe(true);
      waited ||= traffic.getDebugInfo().waitingCount > 0;
      expect(traffic.getDebugInfo().reservationCount).toBeLessThanOrEqual(1);
      for (let a = 0; a < states.length; a++) for (let b = a + 1; b < states.length; b++) minGap = Math.min(minGap, Math.hypot(states[a]!.position.x - states[b]!.position.x, states[a]!.position.z - states[b]!.position.z));
    }
    console.info('JUNCTION_STRESS', { waited, minGap, telemetry: traffic.getDebugInfo() });
    expect(waited).toBe(true); expect(minGap).toBeGreaterThan(config.vehicle.sedan.chassisWidth);
    expect(traffic.getStates().filter((s) => s.routeTransitions > 0)).toHaveLength(4);
    expect(traffic.getDebugInfo().spinCount).toBe(0); expect(traffic.getDebugInfo().recoveryCount).toBe(0);
    traffic.dispose(); expect(physics.vehicleControllerCount).toBe(0); physics.dispose();
  });

  it('physically brakes before a stationary player vehicle instead of colliding with it', async () => {
    const physics = new PhysicsWorld(); await physics.initialize(); physics.createStaticBox([0, -.5, 100], [50, .5, 200]); physics.step(1 / 60);
    const network: UrbanMobilityNetwork = { lanes: [lane('following', 0, 40, 0, 240)], intersections: [], laneConnections: [], pedestrianNodes: [], pedestrianConnections: [], crossings: [] };
    const traffic = new TrafficManager(new Scene(), physics, { ...config.traffic, maxActive: 1, maxBackground: 1, spawnMaxDistance: 230, activeRadius: 260, despawnRadius: 280 }, config.vehicle.sedan, 'following', () => 0);
    traffic.fixedUpdate(1 / 60, { x: 0, z: 0 }, network, undefined); physics.step(1 / 60); traffic.captureAfterStep();
    const start = traffic.getStates()[0]!.position.z; const obstacle = { x: 0, z: start + 35, speed: 0 };
    const parked = physics.createVehicle([0, 1, obstacle.z], 0, config.vehicle.sedan);
    let braking = false; let peakSpeed = 0;
    for (let step = 0; step < 1200; step++) {
      for (let i = 0; i < 4; i++) parked.controller.setWheelBrake(i, config.vehicle.sedan.brakeForce);
      physics.updateVehicle(parked, 1 / 60);
      traffic.fixedUpdate(1 / 60, { x: 0, z: 0 }, network, obstacle); physics.step(1 / 60); traffic.captureAfterStep();
      const state = traffic.getStates()[0]!; braking ||= state.brake > .1; peakSpeed = Math.max(peakSpeed, state.speed);
      expect(obstacle.z - state.position.z).toBeGreaterThan(config.vehicle.sedan.chassisLength);
    }
    expect(peakSpeed).toBeGreaterThan(1); expect(braking).toBe(true); expect(traffic.getStates()[0]!.speed).toBeLessThan(.5);
    traffic.dispose(); physics.removeVehicle(parked); expect(physics.bodyCount).toBe(1); physics.dispose();
  });
  it('brakes after a failed recovery instead of endlessly spinning or resetting beside the player', async () => {
    const physics = new PhysicsWorld(); await physics.initialize(); physics.createStaticBox([0, -.5, 100], [50, .5, 200]); physics.step(1 / 60);
    const network: UrbanMobilityNetwork = { lanes: [lane('blocked', 0, 40, 0, 240)], intersections: [], laneConnections: [], pedestrianNodes: [], pedestrianConnections: [], crossings: [] };
    const scene = new Scene();
    const traffic = new TrafficManager(scene, physics, { ...config.traffic, maxActive: 1, maxBackground: 1, spawnMaxDistance: 230, activeRadius: 260, despawnRadius: 280 }, config.vehicle.sedan, 'blocked', () => 0);
    traffic.fixedUpdate(1 / 60, { x: 0, z: 0 }, network, undefined); physics.step(1 / 60); traffic.captureAfterStep();
    const focus = { ...traffic.getStates()[0]!.position };
    physics.createStaticCuboid([focus.x, 2, focus.z + 8], [4, 2, 1], 0);
    for (let i = 0; i < 3600; i++) { traffic.fixedUpdate(1 / 60, focus, network, undefined); physics.step(1 / 60); traffic.captureAfterStep(); }
    const info = traffic.getDebugInfo(); const state = traffic.getStates()[0]!;
    expect(info.recoveryCount).toBeGreaterThan(0); expect(info.recoveryCount).toBeLessThanOrEqual(2);
    expect(info.activationCount).toBe(1); expect(info.spinCount).toBe(0);
    expect(state.activity).toBe('recovering'); expect(state.throttle).toBe(0); expect(state.brake).toBe(1);
    expect(state.position.z).toBeLessThan(focus.z + 6); expect(physics.vehicleControllerCount).toBe(1);
    traffic.dispose(); expect(scene.children).toHaveLength(0); expect(physics.vehicleControllerCount).toBe(0); physics.dispose();
  });
  it.each([-1, 1])('physically follows a %s turn from a confirmed incoming-lane spawn', async (sign) => {
    const physics = new PhysicsWorld(); await physics.initialize(); physics.createStaticBox([0, -.5, 80], [200, .5, 200]); physics.step(1 / 60);
    const incoming = lane('a:incoming', 0, 40, 0, 120); const outgoing = lane('b:outgoing', 0, 120, sign * 100, 120);
    const network: UrbanMobilityNetwork = { lanes: [incoming, outgoing], intersections: [{ id: 'junction', nodeId: 'junction', position: { x: 0, z: 120 }, connectedRoadIds: [incoming.id, outgoing.id], incomingLaneIds: [incoming.id], outgoingLaneIds: [outgoing.id] }], laneConnections: [{ id: 'turn', intersectionId: 'junction', incomingLaneId: incoming.id, outgoingLaneId: outgoing.id, turn: sign === 1 ? 'right' : 'left' }], pedestrianNodes: [], pedestrianConnections: [], crossings: [] };
    const traffic = new TrafficManager(new Scene(), physics, { ...config.traffic, maxActive: 1, maxBackground: 1, activeRadius: 220, despawnRadius: 240 }, config.vehicle.sedan, 'turn-stress', () => 0);
    traffic.fixedUpdate(1 / 60, { x: 0, z: 0 }, network, undefined);
    const initial = traffic.getStates()[0]!;
    expect(initial.laneId).toBe(incoming.id); expect(initial.tier).toBe('active');
    let peakYaw = 0; let contacts = 0;
    for (let step = 0; step < 2400; step++) {
      traffic.fixedUpdate(1 / 60, { x: 0, z: 0 }, network, undefined); physics.step(1 / 60); traffic.captureAfterStep();
      const state = traffic.getStates()[0]!; peakYaw = Math.max(peakYaw, state.yaw * sign); contacts = Math.max(contacts, state.wheelContactCount);
      assertFinitePhysics(state.id, [state.position.x, state.position.y, state.position.z, state.yaw, state.speed, state.steering]);
    }
    const state = traffic.getStates()[0]!;
    console.info('TURN', sign, state.laneId, state.position, state.yaw, traffic.getDebugInfo());
    expect(state.laneId).toBe(outgoing.id); expect(state.routeTransitions).toBeGreaterThanOrEqual(1);
    expect(peakYaw).toBeGreaterThan(1); expect(contacts).toBe(4); expect(traffic.getDebugInfo().spinCount).toBe(0);
    expect(state.position.x * sign).toBeGreaterThan(5);
    traffic.dispose(); expect(physics.vehicleControllerCount).toBe(0); expect(physics.bodyCount).toBe(1); physics.dispose();
  });

  it('validates 120 lane candidates against real ground, buildings, vehicles and void', async () => {
    const physics = new PhysicsWorld(); await physics.initialize(); physics.createStaticBox([0, -.5, 0], [1000, .5, 300]);
    for (let i = 0; i < 120; i += 10) physics.createStaticCuboid([(i - 60) * 12, 2, 0], [3, 2, 4], 0);
    physics.step(1 / 60); let accepted = 0; let rejected = 0;
    for (let i = 0; i < 120; i++) {
      const road = lane(`spawn:${i}`, (i - 60) * 12, -60, (i - 60) * 12, 60);
      const result = validateTrafficSpawn(road, .5, physics, config.vehicle.sedan, config.traffic, () => 0, () => true);
      if (i % 10 === 0) { expect(result).toBeUndefined(); rejected++; }
      else { expect(result).toBeDefined(); accepted++; expect(projectPath(road.path, result!.position).lateralError).toBeLessThan(config.traffic.spawnMaxLateralError); expect(result!.yaw).toBe(0); }
    }
    expect(accepted).toBe(108); expect(rejected).toBe(12);
    const voidLane = lane('void', 2000, -60, 2000, 60);
    expect(validateTrafficSpawn(voidLane, .5, physics, config.vehicle.sedan, config.traffic, () => 0, () => true)).toBeUndefined();
    const blockedLane = lane('occupied', 12, -60, 12, 60);
    const car = physics.createVehicle([12, 1, 0], 0, config.vehicle.sedan); physics.step(1 / 60);
    expect(validateTrafficSpawn(blockedLane, .5, physics, config.vehicle.sedan, config.traffic, () => 0, () => true)).toBeUndefined();
    expect(validateTrafficSpawn(blockedLane, .5, physics, config.vehicle.sedan, config.traffic, () => NaN, () => true)).toBeUndefined();
    physics.removeVehicle(car); physics.dispose();
  });

  it('runs eight real AI sedans for two minutes with finite motion and no sustained spin', async () => {
    const physics = new PhysicsWorld(); await physics.initialize(); physics.createStaticBox([256, -.5, 256], [600, .5, 600]); physics.step(1 / 60);
    const layout = new CityLayoutGenerator(config.world.seed, config.city, () => 0).generateRegion({ x: 0, z: 0 });
    const network = buildUrbanMobilityNetwork([layout], config.city.mobility);
    const traffic = new TrafficManager(new Scene(), physics, config.traffic, config.vehicle.sedan, config.world.seed, () => 0);
    let peakActive = 0; let peakContacts = 0; let peakPathError = 0; let offLaneSamples = 0;
    const lanes = new Map(network.lanes.map((lane) => [lane.id, lane]));
    for (let step = 0; step < 7200; step++) {
      traffic.fixedUpdate(1 / 60, { x: 256, z: 256 }, network, undefined); physics.step(1 / 60); traffic.captureAfterStep();
      const debug = traffic.getDebugInfo(); peakActive = Math.max(peakActive, debug.activeCount);
      expect(physics.vehicleControllerCount).toBe(debug.activeCount);
      for (const state of traffic.getStates().filter((state) => state.tier === 'active')) {
        assertFinitePhysics(state.id, [state.position.x, state.position.y, state.position.z, state.yaw, state.speed, state.steering]);
        peakContacts = Math.max(peakContacts, state.wheelContactCount);
        const current = lanes.get(state.laneId)!; const next = state.nextLaneId ? lanes.get(state.nextLaneId) : undefined;
        const error = projectPath(buildTrafficPath(current, next, config.traffic.intersectionStopDistance), state.position).lateralError;
        peakPathError = Math.max(peakPathError, error); if (error > 3) offLaneSamples++;
      }
    }
    console.info('TRAFFIC_STRESS', { ...traffic.getDebugInfo(), peakPathError, offLaneSamples });
    expect(offLaneSamples).toBe(0);
    expect(peakActive).toBe(8); expect(peakContacts).toBe(4); expect(traffic.getDebugInfo().spinCount).toBe(0);
    expect(traffic.getDebugInfo().routeTransitions).toBeGreaterThan(5);
    expect(traffic.getDebugInfo().recoveryCount).toBeLessThan(8);
    traffic.dispose(); expect(physics.vehicleControllerCount).toBe(0); expect(physics.colliderCount).toBe(1); physics.dispose();
  }, 30_000);
});
