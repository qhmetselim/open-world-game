import { Scene } from 'three';
import { describe, expect, it } from 'vitest';
import { defaultGameConfig } from '../core/Config';
import type { UrbanMobilityNetwork } from '../city/UrbanMobility';
import { NpcManager } from './NpcManager';

const network: UrbanMobilityNetwork = {
  lanes: [], intersections: [], crossings: [], laneConnections: [],
  pedestrianNodes: [
    { id: 'a', position: { x: 0, z: 0 }, roadId: 'road', side: 'left', connectionIds: ['ab'] },
    { id: 'b', position: { x: 64, z: 0 }, roadId: 'road', side: 'left', connectionIds: ['ab', 'bc'] },
    { id: 'c', position: { x: 128, z: 0 }, roadId: 'road', side: 'left', connectionIds: ['bc'] },
    { id: 'd', position: { x: 192, z: 0 }, roadId: 'road', side: 'left', connectionIds: [] }
  ],
  pedestrianConnections: [
    { id: 'ab', fromNodeId: 'a', toNodeId: 'b', type: 'sidewalk', roadId: 'road' },
    { id: 'bc', fromNodeId: 'b', toNodeId: 'c', type: 'crossing', roadId: 'road' }
  ]
};

describe('NPC population manager', () => {
  it('activates bounded deterministic agents, follows graph paths, and disposes views', () => {
    const scene = new Scene();
    const config = { ...defaultGameConfig.npc, activeRadius: 100, deactivateRadius: 120, maxActive: 2, populationNodeStride: 1, idleSecondsMin: 0, idleSecondsMax: 0 };
    const manager = new NpcManager(scene, config, 'test-world', () => 0);
    for (let frame = 0; frame < 360; frame += 1) manager.fixedUpdate(1 / 60, { x: 20, z: 0 }, network);
    const debug = manager.getDebugInfo();
    expect(debug.activeCount).toBeLessThanOrEqual(2);
    expect(debug.renderedCount).toBe(debug.activeCount);
    expect(debug.walkingCount + debug.idleCount).toBeGreaterThan(0);
    expect(manager.getNearestNpc({ x: 20, z: 0 }, 100)).toBeDefined();
    for (let chunk = 1; chunk <= 12; chunk += 1) manager.fixedUpdate(1 / 60, { x: chunk * 128, z: 0 }, network);
    expect(manager.getDebugInfo().activeCount).toBeLessThanOrEqual(2);
    manager.dispose();
    expect(scene.children).toHaveLength(0);
  });
});
