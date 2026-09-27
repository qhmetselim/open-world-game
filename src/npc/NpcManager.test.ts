import { Scene } from 'three';
import { describe, expect, it } from 'vitest';
import { defaultGameConfig } from '../core/Config';
import type { UrbanMobilityNetwork } from '../city/UrbanMobility';
import { NpcManager } from './NpcManager';
import { MoneyDrops } from '../economy/MoneyDrops';
import { Mesh, MeshStandardMaterial } from 'three';

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
  it('holds then fades civilians, cleans navigation/spatial/view references and never revives on reload',()=>{
    const scene=new Scene(),config={...defaultGameConfig.npc,populationNodeStride:1};
    const manager=new NpcManager(scene,config,'corpse',()=>0),focus={x:0,z:0};
    manager.fixedUpdate(.01,focus,network);
    const npc=manager.getNearestNpc(focus,10)!,drops=new MoneyDrops();
    manager.damage(npc.id,100);drops.spawn(npc.id,npc.position);
    expect(manager.getNearbyActive(focus,10)).not.toContain(npc);
    expect(npc.pathNodeIds).toHaveLength(0);
    manager.fixedUpdate(config.corpseHoldSeconds,focus,network);manager.render(.01);
    expect(scene.getObjectByName(npc.id)).toBeDefined();expect(npc.corpseOpacity).toBe(1);
    manager.fixedUpdate(config.corpseFadeSeconds/2,focus,network);manager.render(.01);
    expect(npc.corpseOpacity).toBeCloseTo(.5);
    const root=scene.getObjectByName(npc.id)!;
    root.traverse(o=>{if(o instanceof Mesh&&o.material instanceof MeshStandardMaterial)expect(o.material.opacity).toBeCloseTo(.5);});
    manager.fixedUpdate(config.corpseFadeSeconds,focus,network);
    expect(scene.getObjectByName(npc.id)).toBeUndefined();expect(manager.getNearestNpc(focus,10)).toBeUndefined();
    expect(drops.active.get(npc.id)!.position.y).toBeGreaterThan(1);
    manager.fixedUpdate(.1,{x:5000,z:5000},network);manager.fixedUpdate(.1,focus,network);
    expect(scene.getObjectByName(npc.id)).toBeUndefined();manager.dispose();expect(scene.children).toHaveLength(0);
  });
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
