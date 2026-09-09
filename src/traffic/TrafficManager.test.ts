import { Scene } from 'three';
import { describe, expect, it } from 'vitest';
import { defaultGameConfig } from '../core/Config';
import type { UrbanMobilityNetwork, VehicleLane } from '../city/UrbanMobility';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { TrafficManager } from './TrafficManager';

const lane = (id: string, start: { x: number; z: number }, end: { x: number; z: number }): VehicleLane => ({ id, roadId: id, direction: 'forward', laneIndex: 0, roadClass: 'local', speedMetadata: 30, startNodeId: `${id}:a`, endNodeId: `${id}:b`, path: [start, end] });
const lanes = [lane('lane:one', { x: 0, z: 45 }, { x: 0, z: 145 }), lane('lane:two', { x: 12, z: 48 }, { x: 12, z: 148 })];
const network: UrbanMobilityNetwork = { lanes, intersections: [], laneConnections: [], pedestrianNodes: [], pedestrianConnections: [], crossings: [] };
const multiNetwork: UrbanMobilityNetwork = {
  lanes: Array.from({ length: 8 }, (_, index) => lane(`lane:multi:${index}`, { x: (index - 4) * 12, z: 42 }, { x: (index - 4) * 12, z: 142 })),
  intersections: [], laneConnections: [], pedestrianNodes: [], pedestrianConnections: [], crossings: []
};

const turnNetwork: UrbanMobilityNetwork = {
  lanes: [
    lane('lane:turn:in', { x: 0, z: 42 }, { x: 0, z: 62 }),
    lane('lane:turn:right', { x: 0, z: 62 }, { x: 70, z: 62 })
  ],
  intersections: [{ id: 'intersection:turn', nodeId: 'node:turn', position: { x: 0, z: 62 }, connectedRoadIds: ['lane:turn:in', 'lane:turn:right'], incomingLaneIds: ['lane:turn:in'], outgoingLaneIds: ['lane:turn:right'] }],
  laneConnections: [{ id: 'connection:turn:right', intersectionId: 'intersection:turn', incomingLaneId: 'lane:turn:in', outgoingLaneId: 'lane:turn:right', turn: 'right' }],
  pedestrianNodes: [], pedestrianConnections: [], crossings: []
};

describe('active Rapier traffic integration', () => {
  it('creates bounded four-wheel AI sedans, advances them, and cleans physics resources', async () => {
    const physics = new PhysicsWorld(); await physics.initialize(); physics.createStaticBox([0, -.5, 100], [200, .5, 200]);
    const traffic = new TrafficManager(new Scene(), physics, { ...defaultGameConfig.traffic, maxActive: 2, maxBackground: 2, spawnMinDistance: 20, spawnMaxDistance: 180, activationBudget: 2 }, defaultGameConfig.vehicle.sedan, 'test', () => 0);
    for (let frame = 0; frame < 240; frame += 1) { traffic.fixedUpdate(1 / 60, { x: 0, z: 0 }, network, undefined); physics.step(1 / 60); }
    const debug = traffic.getDebugInfo();
    expect(debug.activeCount).toBeGreaterThan(0);
    expect(debug.activeCount).toBeLessThanOrEqual(2);
    expect(debug.controllerCount).toBe(debug.activeCount);
    expect(traffic.getStates().some((state) => state.tier === 'active' && state.speed > .1)).toBe(true);
    expect(physics.bodyCount).toBeGreaterThan(1);
    traffic.dispose();
    expect(physics.bodyCount).toBe(1);
    physics.dispose();
  });

  it('recycles distant traffic without leaving active controllers behind', async () => {
    const physics = new PhysicsWorld(); await physics.initialize(); physics.createStaticBox([0, -.5, 100], [300, .5, 300]);
    const traffic = new TrafficManager(new Scene(), physics, { ...defaultGameConfig.traffic, maxActive: 2, maxBackground: 2, spawnMinDistance: 20, spawnMaxDistance: 180, activeRadius: 80, despawnRadius: 100, activationBudget: 2 }, defaultGameConfig.vehicle.sedan, 'test', () => 0);
    for (let frame = 0; frame < 30; frame += 1) { traffic.fixedUpdate(1 / 60, { x: 0, z: 0 }, network, undefined); physics.step(1 / 60); }
    expect(traffic.getDebugInfo().controllerCount).toBeGreaterThan(0);
    for (let frame = 0; frame < 30; frame += 1) { traffic.fixedUpdate(1 / 60, { x: 1_280, z: 0 }, network, undefined); physics.step(1 / 60); }
    const debug = traffic.getDebugInfo();
    expect(debug.activeCount).toBe(0);
    expect(debug.backgroundCount).toBeLessThanOrEqual(2);
    expect(debug.controllerCount).toBe(0);
    expect(physics.bodyCount).toBe(1);
    traffic.dispose(); physics.dispose();
  });

  it('keeps an eight-sedan active population bounded with unique identities and controllers', async () => {
    const physics = new PhysicsWorld(); await physics.initialize(); physics.createStaticBox([0, -.5, 100], [300, .5, 300]);
    const traffic = new TrafficManager(new Scene(), physics, { ...defaultGameConfig.traffic, maxActive: 8, maxBackground: 8, spawnMinDistance: 20, spawnMaxDistance: 180, activationBudget: 8 }, defaultGameConfig.vehicle.sedan, 'test', () => 0);
    for (let frame = 0; frame < 120; frame += 1) { traffic.fixedUpdate(1 / 60, { x: 0, z: 0 }, multiNetwork, undefined); physics.step(1 / 60); }
    const states = traffic.getStates();
    expect(new Set(states.map((state) => state.id)).size).toBe(states.length);
    expect(traffic.getDebugInfo().activeCount).toBeLessThanOrEqual(8);
    expect(traffic.getDebugInfo().controllerCount).toBe(traffic.getDebugInfo().activeCount);
    traffic.dispose(); expect(physics.bodyCount).toBe(1); physics.dispose();
  });

  it('uses real Rapier steering to transition into a right-turn outgoing lane', async () => {
    const physics = new PhysicsWorld(); await physics.initialize(); physics.createStaticBox([30, -.5, 62], [160, .5, 160]);
    const traffic = new TrafficManager(new Scene(), physics, { ...defaultGameConfig.traffic, maxActive: 1, maxBackground: 1, spawnMinDistance: 20, spawnMaxDistance: 100, activationBudget: 1, laneLookAhead: 10 }, defaultGameConfig.vehicle.sedan, 'right-turn', () => 0);
    for (let frame = 0; frame < 600; frame += 1) { traffic.fixedUpdate(1 / 60, { x: 0, z: 0 }, turnNetwork, undefined); physics.step(1 / 60); }
    const state = traffic.getStates()[0];
    expect(state).toBeDefined();
    expect(state?.laneId).toBe('lane:turn:right');
    // Forward is +Z at yaw 0; a right turn toward +X has a positive yaw.
    expect(state?.yaw ?? 0).toBeGreaterThan(0.2);
    traffic.dispose(); physics.dispose();
  });
});
