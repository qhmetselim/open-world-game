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
});
