import { Scene } from 'three';
import { describe, expect, it } from 'vitest';
import { defaultGameConfig as config } from '../core/Config';
import type { UrbanMobilityNetwork, VehicleLane, PedestrianCrossing } from '../city/UrbanMobility';
import type { NpcState } from '../npc/NpcTypes';
import { TrafficSignalView } from '../render/TrafficSignalView';
import { IntersectionReservationBook } from './IntersectionReservation';
import { TrafficRuleNetwork, movementPriority, mustStopAtSignal, pedestrianBlocksCrossing, signalColor, stoppingSpeed } from './TrafficRules';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { TrafficManager } from './TrafficManager';
import { createTrafficIdentity } from './TrafficIdentity';
import { buildTrafficPath, pathObstacleGap, projectPath } from './TrafficPath';

export function ruleLane(id: string, ax: number, az: number, bx: number, bz: number): VehicleLane {
  return { id, roadId: id, direction: 'forward', laneIndex: 0, roadClass: 'arterial', speedMetadata: 40,
    startNodeId: `${id}:a`, endNodeId: `${id}:b`, path: [{ x: ax, z: az }, { x: bx, z: bz }] };
}
export function ruleFixture(): UrbanMobilityNetwork {
  const incoming = [ruleLane('a:south', 2, -180, 2, 0), ruleLane('a:north', -2, 180, -2, 0), ruleLane('a:west', -180, -2, 0, -2), ruleLane('a:east', 180, 2, 0, 2)];
  const outgoing = [ruleLane('z:north', 2, 0, 2, 180), ruleLane('z:south', -2, 0, -2, -180), ruleLane('z:east', 0, -2, 180, -2), ruleLane('z:west', 0, 2, -180, 2)];
  return { lanes: [...incoming, ...outgoing], intersections: [{ id: 'junction', nodeId: 'junction', position: { x: 0, z: 0 }, incomingLaneIds: incoming.map((l) => l.id), outgoingLaneIds: outgoing.map((l) => l.id), connectedRoadIds: [...incoming, ...outgoing].map((l) => l.roadId) }],
    laneConnections: incoming.map((l, i) => ({ id: `through:${i}`, incomingLaneId: l.id, outgoingLaneId: outgoing[i]!.id, intersectionId: 'junction', turn: 'straight' })), pedestrianNodes: [], pedestrianConnections: [], crossings: [] };
}
export const crossing: PedestrianCrossing = { id: 'crossing', intersectionId: 'junction', roadId: 'a:south', startNodeId: 'ped:a', endNodeId: 'ped:b', start: { x: -6, z: -10 }, end: { x: 6, z: -10 } };
export function pedestrian(x = 0, z = -10): NpcState {
  return { id: 'pedestrian', position: { x, y: .12, z }, facingYaw: Math.PI / 2, currentNodeId: 'ped:a', destinationNodeId: 'ped:b', pathNodeIds: ['ped:a', 'ped:b'], pathIndex: 0, activity: 'walking', tier: 'active', idleRemaining: 0, tripIndex: 0, backgroundElapsed: 0,
    appearance: { heightScale: 1, widthScale: 1, shirtColor: 0, pantsColor: 0, skinColor: 0, hairColor: 0, hairStyle: 0 } };
}

describe('deterministic traffic safety rules', () => {
  it('regenerates stable signals independently of lane order, with a complete repeatable cycle', () => {
    const network = ruleFixture(); const rules = config.traffic.rules;
    const a = new TrafficRuleNetwork(network, 'rules', rules, 9);
    const b = new TrafficRuleNetwork({ ...network, lanes: [...network.lanes].reverse() }, 'rules', rules, 9);
    expect(a.approaches).toEqual(b.approaches);
    const approach = a.approaches[0]!; const duration = 4 * (rules.greenDuration + rules.yellowDuration + rules.allRedDuration);
    const seen = new Set();
    for (let t = 0; t < duration; t += .25) {
      const color = signalColor(approach, t, rules); seen.add(color);
      expect(signalColor(approach, t + duration, rules)).toBe(color);
    }
    expect(seen).toEqual(new Set(['green', 'yellow', 'red']));
    expect(new TrafficRuleNetwork(network, 'other', rules, 9).approaches[0]!.phaseOffset).not.toBe(approach.phaseOffset);
  });
  it('never gives conflicting approaches simultaneous green or yellow and includes all-red clearance', () => {
    const rules = config.traffic.rules; const network = new TrafficRuleNetwork(ruleFixture(), 'rules', rules, 9);
    let allRed = 0;
    for (let t = 0; t < 100; t += .1) {
      const colors = network.approaches.map((a) => signalColor(a, t, rules));
      expect(colors.filter((c) => c !== 'red').length).toBeLessThanOrEqual(1);
      if (colors.every((c) => c === 'red')) allRed++;
    }
    expect(allRed).toBeGreaterThan(0);
  });
  it('leaves local junctions unsignalized and locates stop lines before crosswalks', () => {
    const original = ruleFixture(); const network = { ...original, crossings: [crossing], lanes: original.lanes.map((l) => ({ ...l, roadClass: 'local' as const })) };
    const rules = new TrafficRuleNetwork(network, 'rules', config.traffic.rules, 9);
    expect(rules.approaches).toHaveLength(0);
    const stop = rules.laneRules.get('a:south')!;
    expect(stop.stopPoint.z).toBeLessThan(crossing.start.z - config.traffic.rules.crossingWidth / 2);
    expect(stop.stopDistance).toBeCloseTo(12.6);
  });
  it('stops on red, permits green, and distinguishes yellow stopping distance from the dilemma zone', () => {
    expect(mustStopAtSignal('red', 8, 20, 3)).toBe(true);
    expect(mustStopAtSignal('green', 8, 20, 3)).toBe(false);
    expect(mustStopAtSignal('yellow', 8, 20, 3)).toBe(true);
    expect(mustStopAtSignal('yellow', 8, 4, 3)).toBe(false);
    expect(stoppingSpeed(0, 3)).toBe(0);
    expect(stoppingSpeed(4, 3)).toBeLessThan(stoppingSpeed(20, 3));
  });
  it('grants major roads first, straight before turns, but ages a minor-road request ahead of fresh major traffic', () => {
    const lane = ruleFixture().lanes[0]!; const minor = { ...lane, roadClass: 'local' as const };
    const majorPriority = movementPriority(lane, 'straight'); const minorPriority = movementPriority(minor, 'left');
    expect(movementPriority(lane, 'straight')).toBeGreaterThan(movementPriority(lane, 'left'));
    const book = new IntersectionReservationBook();
    book.enqueue('j', 'minor', 0, minorPriority); book.enqueue('j', 'major', 0, majorPriority);
    expect(book.request('j', 'minor', 0, 5, minorPriority)).toBe(false);
    expect(book.request('j', 'major', 0, 5, majorPriority)).toBe(true);
    book.release('j', 'major'); book.enqueue('j', 'new-major', 13, majorPriority);
    expect(book.request('j', 'new-major', 13, 5, majorPriority, 12)).toBe(false);
    expect(book.request('j', 'minor', 13, 5, minorPriority, 12)).toBe(true);
  });
  it('retains an occupied conflict box until cleared, but expires abandoned leases', () => {
    const book = new IntersectionReservationBook(); expect(book.request('j', 'inside', 0, 2)).toBe(true);
    book.retainOccupied('j', 'inside', 1.9); expect(book.request('j', 'waiting', 2.1, 2)).toBe(false);
    book.release('j', 'inside'); expect(book.request('j', 'waiting', 2.2, 2)).toBe(true);
    book.expire(5); expect(book.count).toBe(0);
  });
  it('recognizes occupied and imminent crossing edges without stopping for distant or idle sidewalk pedestrians', () => {
    const rules = config.traffic.rules;
    expect(pedestrianBlocksCrossing(pedestrian(), crossing, rules)).toBe(true);
    expect(pedestrianBlocksCrossing(pedestrian(-7), crossing, rules)).toBe(true);
    expect(pedestrianBlocksCrossing(pedestrian(-12), crossing, rules)).toBe(false);
    expect(pedestrianBlocksCrossing({ ...pedestrian(-7), activity: 'idle' }, crossing, rules)).toBe(false);
    expect(pedestrianBlocksCrossing({ ...pedestrian(), tier: 'background' }, crossing, rules)).toBe(false);
    expect(pedestrianBlocksCrossing({ ...pedestrian(7), pathNodeIds: ['ped:b', 'sidewalk'], pathIndex: 1 }, crossing, rules)).toBe(false);
  });
  it('streams three shared signal batches without physics or accumulating scene resources', () => {
    const scene = new Scene(); const rules = new TrafficRuleNetwork(ruleFixture(), 'rules', config.traffic.rules, 9);
    const view = new TrafficSignalView(scene, config.traffic.rules, () => 0);
    for (let i = 0; i < 20; i++) {
      view.sync(rules.approaches, rules.laneRules); view.update(rules.approaches.map((a) => signalColor(a, i, config.traffic.rules)));
      expect(scene.children[0]!.children).toHaveLength(3); expect(view.count).toBe(1);
      view.sync([], rules.laneRules); expect(scene.children[0]!.children).toHaveLength(0);
    }
    view.dispose(scene); expect(scene.children).toHaveLength(0);
  });
  it('does not mistake a red-stopped opposing approach for the leader of a turning route', () => {
    const incoming = ruleLane('in', 0, -4.65, 100, -4.65);
    const outgoing = ruleLane('out', 98.45, 0, 98.45, -150);
    const path = [...buildTrafficPath(incoming, outgoing, 9), outgoing.path.at(-1)!];
    const progress = projectPath(path, { x: 97.4, z: -6.47 }).distance;
    // Across the turn's instantaneous heading, but outside its authored driving corridor.
    expect(pathObstacleGap(path, progress, { x: 104.65, z: -13.87 }, 1.85)).toBeUndefined();
    expect(pathObstacleGap(path, progress, { x: 98.45, z: -30 }, 1.85)).toBeGreaterThan(15);
  });
});

describe('real Rapier traffic rule scenarios', () => {
  it('wakes a sleeping stopped chassis when wheel propulsion resumes', async () => {
    const physics = new PhysicsWorld(); await physics.initialize(); physics.createStaticBox([0, -.5, 0], [100, .5, 100]); physics.step(1 / 60);
    const vehicle = physics.createVehicle([0, 1, 0], 0, config.vehicle.sedan);
    for (let tick = 0; tick < 180; tick++) { physics.updateVehicle(vehicle, 1 / 60); physics.step(1 / 60); }
    vehicle.body.sleep(); expect(vehicle.body.isSleeping()).toBe(true);
    physics.updateVehicle(vehicle, 1 / 60); expect(vehicle.body.isSleeping()).toBe(true);
    vehicle.controller.setWheelEngineForce(2, config.vehicle.sedan.engineForce);
    vehicle.controller.setWheelEngineForce(3, config.vehicle.sedan.engineForce);
    physics.updateVehicle(vehicle, 1 / 60); expect(vehicle.body.isSleeping()).toBe(false);
    const start = vehicle.body.translation().z;
    for (let tick = 0; tick < 180; tick++) { physics.updateVehicle(vehicle, 1 / 60); physics.step(1 / 60); }
    expect(vehicle.body.translation().z - start).toBeGreaterThan(3);
    physics.removeVehicle(vehicle); physics.dispose();
  });
  it.each([-1, 1])('completes a signal-controlled %s turn with the existing physical steering convention', async (sign) => {
    const original = ruleFixture(); const outgoing = sign > 0 ? 'z:east' : 'z:west';
    const network = { ...original, laneConnections: original.laneConnections.map((c) => c.incomingLaneId === 'a:south' ? { ...c, outgoingLaneId: outgoing, turn: sign > 0 ? 'right' as const : 'left' as const } : c) };
    const physics = new PhysicsWorld(); await physics.initialize(); physics.createStaticBox([0, -.5, 0], [300, .5, 300]); physics.step(1 / 60);
    const traffic = new TrafficManager(new Scene(), physics, { ...config.traffic, maxActive: 1, maxBackground: 1, activeRadius: 260, despawnRadius: 280 }, config.vehicle.sedan, 'signal-turn', () => 0);
    let signedYaw = 0;
    for (let step = 0; step < 6000; step++) {
      traffic.fixedUpdate(1 / 60, { x: 0, z: 0 }, network, undefined); physics.step(1 / 60); traffic.captureAfterStep();
      signedYaw = Math.max(signedYaw, traffic.getStates()[0]!.yaw * sign);
    }
    expect(traffic.getStates()[0]!.laneId).toBe(outgoing); expect(signedYaw).toBeGreaterThan(1);
    expect(traffic.getDebugInfo().spinCount).toBe(0); expect(traffic.getDebugInfo().recoveryCount).toBe(0);
    traffic.dispose(); physics.dispose();
  });
  it('waits for a player-blocked conflict area without touching player controls, then proceeds once clear', async () => {
    const original = ruleFixture(); const network = { ...original, lanes: original.lanes.map((l) => ({ ...l, roadClass: 'local' as const })) };
    const physics = new PhysicsWorld(); await physics.initialize(); physics.createStaticBox([0, -.5, 0], [300, .5, 300]); physics.step(1 / 60);
    const parked = physics.createVehicle([0, 1, 0], Math.PI / 2, config.vehicle.sedan);
    const obstacle = Object.freeze({ x: 0, z: 0, speed: 0 });
    const traffic = new TrafficManager(new Scene(), physics, { ...config.traffic, maxActive: 1, maxBackground: 1, activeRadius: 260, despawnRadius: 280 }, config.vehicle.sedan, 'blocked-safety', () => 0);
    let waited = false;
    for (let step = 0; step < 4200; step++) {
      if (step < 1800) {
        for (let wheel = 0; wheel < 4; wheel++) parked.controller.setWheelBrake(wheel, config.vehicle.sedan.brakeForce);
        physics.updateVehicle(parked, 1 / 60);
      } else if (step === 1800) physics.removeVehicle(parked);
      traffic.fixedUpdate(1 / 60, { x: 0, z: 0 }, network, step < 1800 ? obstacle : undefined); physics.step(1 / 60); traffic.captureAfterStep();
      const state = traffic.getStates()[0]!;
      if (step < 1800) {
        expect(state.position.z + config.vehicle.sedan.chassisLength / 2).toBeLessThan(-9 + .1);
        waited ||= state.activity === 'waitingIntersection' && state.speed < .2 && state.position.z > -16;
        expect(parked.controller.wheelEngineForce(2)).toBe(0);
      }
    }
    expect(waited).toBe(true); expect(traffic.getDebugInfo().routeTransitions).toBeGreaterThan(0);
    expect(obstacle).toEqual({ x: 0, z: 0, speed: 0 }); expect(traffic.getDebugInfo().recoveryCount).toBe(0);
    traffic.dispose(); expect(physics.bodyCount).toBe(1); physics.dispose();
  });
  it('approaches on green, brakes before a red stop line and restarts on the next green without teleporting', async () => {
    const network = ruleFixture(); const rules = config.traffic.rules;
    // Select a deterministic identity whose approach starts late in green, sufficiently far from the line.
    let seed = ''; let ruleNetwork: TrafficRuleNetwork | undefined;
    for (let i = 0; i < 2000; i++) {
      const candidate = `red-green:${i}`; const candidateRules = new TrafficRuleNetwork(network, candidate, rules, 9);
      const approach = candidateRules.laneRules.get('a:south')!.approach!;
      const local = approach.phaseOffset - approach.phaseIndex * (rules.greenDuration + rules.yellowDuration + rules.allRedDuration);
      const identity = createTrafficIdentity(candidate, 'a:south', config.traffic.speedVariationMin, config.traffic.speedVariationMax);
      const z = -180 + 180 * (.12 + ((identity.appearanceSeed >>> 8) % 68) / 100);
      if (local > 9 && local < 11 && z < -55 && z > -85) { seed = candidate; ruleNetwork = candidateRules; break; }
    }
    expect(seed).not.toBe('');
    const line = ruleNetwork!.laneRules.get('a:south')!;
    const physics = new PhysicsWorld(); await physics.initialize(); physics.createStaticBox([0, -.5, 0], [300, .5, 300]); physics.step(1 / 60);
    const traffic = new TrafficManager(new Scene(), physics, { ...config.traffic, maxActive: 1, maxBackground: 1, activeRadius: 260, despawnRadius: 280 }, config.vehicle.sedan, seed, () => 0);
    let stopped = false; let restarted = false; let sawBrake = false; let stoppedZ = 0; let peakSpeed = 0; let previousZ: number | undefined;
    for (let step = 0; step < 6000; step++) {
      traffic.fixedUpdate(1 / 60, { x: 0, z: 0 }, network, undefined); physics.step(1 / 60); traffic.captureAfterStep();
      const state = traffic.getStates()[0]!; peakSpeed = Math.max(peakSpeed, state.speed); sawBrake ||= state.brake > .1 && state.speed > 1;
      if (previousZ !== undefined) expect(Math.abs(state.position.z - previousZ)).toBeLessThan(.4);
      previousZ = state.position.z;
      if (state.signalColor === 'red' && state.laneId === 'a:south') {
        expect(state.position.z + config.vehicle.sedan.chassisLength / 2).toBeLessThan(line.stopPoint.z + .1);
        if (state.speed < .15 && state.position.z > line.stopPoint.z - 6) { stopped = true; stoppedZ = state.position.z; }
      }
      if (stopped && state.position.z > stoppedZ + 6 && state.speed > 1) restarted = true;
    }
    console.info('SIGNAL_STOP_RESTART', { seed, stopped, restarted, sawBrake, peakSpeed, stopLineZ: line.stopPoint.z, stoppedZ, routes: traffic.getDebugInfo().routeTransitions });
    expect(signalColor(line.approach!, 0, rules)).toBe('green');
    expect(stopped).toBe(true); expect(restarted).toBe(true); expect(sawBrake).toBe(true); expect(peakSpeed).toBeGreaterThan(3);
    expect(traffic.getDebugInfo().recoveryCount).toBe(0); expect(traffic.getDebugInfo().routeTransitions).toBeGreaterThan(0);
    traffic.dispose(); expect(physics.vehicleControllerCount).toBe(0); expect(physics.bodyCount).toBe(1); physics.dispose();
  });
  it('brakes for an occupied crossing, waits without stuck recovery, then resumes after the pedestrian walks clear', async () => {
    const original = ruleFixture(); const network = { ...original, crossings: [crossing], lanes: original.lanes.map((l) => ({ ...l, roadClass: 'local' as const })) };
    const npc = pedestrian();
    const physics = new PhysicsWorld(); await physics.initialize(); physics.createStaticBox([0, -.5, 0], [300, .5, 300]); physics.step(1 / 60);
    let queries = 0;
    const traffic = new TrafficManager(new Scene(), physics, { ...config.traffic, maxActive: 1, maxBackground: 1, activeRadius: 260, despawnRadius: 280 }, config.vehicle.sedan, 'crossing-safety', () => 0, () => true, () => { queries++; return [npc]; });
    let stopped = false; let clear = false; let restarted = false; let waitTicks = 0;
    for (let step = 0; step < 3000; step++) {
      traffic.fixedUpdate(1 / 60, { x: 0, z: 0 }, network, undefined); physics.step(1 / 60); traffic.captureAfterStep();
      const state = traffic.getStates()[0]!;
      if (!clear) expect(state.position.z + config.vehicle.sedan.chassisLength / 2).toBeLessThan(crossing.start.z - config.traffic.rules.crossingWidth / 2 + .1);
      if (state.activity === 'yieldingCrossing' && state.speed < .15 && state.position.z > -20) { stopped = true; waitTicks++; }
      // Hold the occupied crossing for longer than the ordinary stuck timeout, then walk off it.
      if (stopped && waitTicks > 600 && npc.position.x < 8) npc.position.x += 1.4 / 60;
      if (npc.position.x >= 6) { clear = true; npc.pathNodeIds = ['ped:b', 'sidewalk']; }
      restarted ||= clear && state.position.z > 0 && state.speed > 1;
    }
    console.info('CROSSING_STOP_CLEAR', { stopped, clear, restarted, queries, recoveries: traffic.getDebugInfo().recoveryCount });
    expect(stopped).toBe(true); expect(clear).toBe(true); expect(restarted).toBe(true); expect(queries).toBeGreaterThan(0);
    expect(traffic.getDebugInfo().recoveryCount).toBe(0);
    traffic.dispose(); expect(physics.bodyCount).toBe(1); physics.dispose();
  });
  it('safely clears four conflicting real vehicles through timed signals without pile-up or permanent waiting', async () => {
    const network = ruleFixture(); const physics = new PhysicsWorld(); await physics.initialize(); physics.createStaticBox([0, -.5, 0], [300, .5, 300]); physics.step(1 / 60);
    const traffic = new TrafficManager(new Scene(), physics, { ...config.traffic, maxActive: 4, maxBackground: 4, activeRadius: 260, despawnRadius: 280, spawnMaxDistance: 190,
      rules: { ...config.traffic.rules, greenDuration: 6, yellowDuration: 2, allRedDuration: 1 } }, config.vehicle.sedan, 'signals-four', () => 0);
    let minGap = Infinity; let redWait = false;
    for (let step = 0; step < 6000; step++) {
      traffic.fixedUpdate(1 / 60, { x: 0, z: 0 }, network, undefined); physics.step(1 / 60); traffic.captureAfterStep();
      const states = traffic.getStates().filter((s) => s.tier === 'active');
      redWait ||= traffic.getDebugInfo().redWaitingCount > 0;
      expect(traffic.getDebugInfo().reservationCount).toBeLessThanOrEqual(1);
      for (let a = 0; a < states.length; a++) for (let b = a + 1; b < states.length; b++) minGap = Math.min(minGap, Math.hypot(states[a]!.position.x - states[b]!.position.x, states[a]!.position.z - states[b]!.position.z));
    }
    console.info('FOUR_SIGNAL_VEHICLES', { minGap, redWait, routes: traffic.getStates().map((s) => s.routeTransitions), telemetry: traffic.getDebugInfo() });
    // Opposing straight lanes pass side-by-side, so longitudinal chassis length is not a clearance radius.
    expect(minGap).toBeGreaterThan(config.vehicle.sedan.chassisWidth + 1); expect(redWait).toBe(true);
    expect(traffic.getStates().filter((s) => s.routeTransitions > 0)).toHaveLength(4);
    expect(traffic.getDebugInfo().recoveryCount).toBe(0); expect(traffic.getDebugInfo().spinCount).toBe(0);
    traffic.dispose(); expect(physics.vehicleControllerCount).toBe(0); physics.dispose();
  });
});
