import { describe, expect, it } from 'vitest';
import { defaultGameConfig } from '../core/Config';
import { findNearestLane, findNearestPedestrianNode, buildUrbanMobilityNetwork } from './UrbanMobility';
import type { CityRegionLayout } from './CityTypes';

function fourWayLayout(): CityRegionLayout {
  const nodes = [
    { id: 'node:w', x: -40, z: 0 }, { id: 'node:c', x: 0, z: 0 }, { id: 'node:e', x: 40, z: 0 },
    { id: 'node:s', x: 0, z: -40 }, { id: 'node:n', x: 0, z: 40 }
  ];
  const segment = (id: string, startNodeId: string, endNodeId: string) => ({ id, startNodeId, endNodeId, type: 'local' as const, width: 7 });
  return {
    coord: { x: 0, z: 0 }, key: '0:0', isUrban: true, nodes,
    segments: [segment('road:w', 'node:w', 'node:c'), segment('road:e', 'node:c', 'node:e'), segment('road:s', 'node:s', 'node:c'), segment('road:n', 'node:c', 'node:n')],
    blocks: [], parcels: []
  };
}

function tJunctionLayout(): CityRegionLayout {
  const layout = fourWayLayout();
  return { ...layout, segments: layout.segments.filter((segment) => segment.id !== 'road:s') };
}

describe('urban mobility lane and pedestrian graph', () => {
  it('places four distinct crosswalk bands outside the intersection centre, deterministically', () => {
    const network = buildUrbanMobilityNetwork([fourWayLayout()], defaultGameConfig.city.mobility);
    const centres = network.crossings.map((crossing) => ({ x: (crossing.start.x + crossing.end.x) / 2, z: (crossing.start.z + crossing.end.z) / 2 }));
    expect(new Set(centres.map((p) => `${p.x}:${p.z}`)).size).toBe(4);
    for (const p of centres) expect(Math.hypot(p.x, p.z)).toBeCloseTo(3.5 + defaultGameConfig.city.mobility.crosswalkWidth / 2);
    expect(buildUrbanMobilityNetwork([fourWayLayout()], defaultGameConfig.city.mobility).crossings).toEqual(network.crossings);
  });
  it('creates deterministic right-hand lanes with stable opposite directions and center offsets', () => {
    const first = buildUrbanMobilityNetwork([fourWayLayout()], defaultGameConfig.city.mobility);
    const second = buildUrbanMobilityNetwork([fourWayLayout()], defaultGameConfig.city.mobility);
    expect(second).toEqual(first);
    const west = first.lanes.filter((lane) => lane.roadId === 'road:w');
    expect(west).toHaveLength(2);
    const forward = west.find((lane) => lane.direction === 'forward');
    const reverse = west.find((lane) => lane.direction === 'reverse');
    expect(forward?.path[0]?.z).toBeCloseTo(-defaultGameConfig.city.mobility.laneWidth / 2);
    expect(reverse?.path[0]?.z).toBeCloseTo(defaultGameConfig.city.mobility.laneWidth / 2);
    expect(forward?.endNodeId).toBe('node:c');
    expect(reverse?.endNodeId).toBe('node:w');
  });

  it('recognizes four-way incoming/outgoing lanes and deterministic straight, left, and right connections', () => {
    const network = buildUrbanMobilityNetwork([fourWayLayout()], defaultGameConfig.city.mobility);
    const intersection = network.intersections[0];
    expect(intersection?.connectedRoadIds).toHaveLength(4);
    expect(intersection?.incomingLaneIds).toHaveLength(4);
    expect(intersection?.outgoingLaneIds).toHaveLength(4);
    expect(network.laneConnections.some((connection) => connection.turn === 'straight')).toBe(true);
    expect(network.laneConnections.some((connection) => connection.turn === 'left')).toBe(true);
    expect(network.laneConnections.some((connection) => connection.turn === 'right')).toBe(true);
    expect(new Set(network.laneConnections.map((connection) => connection.id)).size).toBe(network.laneConnections.length);
    expect(network.laneConnections.every((connection) => connection.incomingLaneId !== connection.outgoingLaneId)).toBe(true);
  });

  it('recognizes a T junction without inventing duplicate or self lane transitions', () => {
    const network = buildUrbanMobilityNetwork([tJunctionLayout()], defaultGameConfig.city.mobility);
    const intersection = network.intersections[0];
    expect(intersection?.connectedRoadIds).toHaveLength(3);
    expect(intersection?.incomingLaneIds).toHaveLength(3);
    expect(intersection?.outgoingLaneIds).toHaveLength(3);
    expect(network.laneConnections.every((connection) => connection.incomingLaneId !== connection.outgoingLaneId)).toBe(true);
    expect(new Set(network.laneConnections.map((connection) => connection.id)).size).toBe(network.laneConnections.length);
  });

  it('builds connected sidewalks, controlled crossings, and nearest graph queries', () => {
    const network = buildUrbanMobilityNetwork([fourWayLayout()], defaultGameConfig.city.mobility);
    expect(network.pedestrianNodes.length).toBe(16);
    expect(network.crossings).toHaveLength(4);
    expect(network.pedestrianNodes.every((node) => node.connectionIds.length > 0)).toBe(true);
    expect(network.pedestrianConnections.some((connection) => connection.type === 'crossing')).toBe(true);
    expect(network.pedestrianConnections.filter((connection) => connection.type === 'sidewalk').every((connection) => {
      const from = network.pedestrianNodes.find((node) => node.id === connection.fromNodeId);
      const to = network.pedestrianNodes.find((node) => node.id === connection.toNodeId);
      return from?.roadId === to?.roadId;
    })).toBe(true);
    expect(findNearestLane({ x: -20, z: -1 }, network.lanes)?.lane.roadId).toBe('road:w');
    expect(findNearestPedestrianNode({ x: -39, z: 6 }, network.pedestrianNodes)?.node.roadId).toBe('road:w');
  });

  it('connects lanes and sidewalks across a shared region/chunk boundary node', () => {
    const west: CityRegionLayout = {
      coord: { x: 0, z: 0 }, key: '0:0', isUrban: false,
      nodes: [{ id: 'node:0', x: 0, z: 0 }, { id: 'node:128', x: 128, z: 0 }],
      segments: [{ id: 'road:west', startNodeId: 'node:0', endNodeId: 'node:128', type: 'local', width: 7 }], blocks: [], parcels: []
    };
    const east: CityRegionLayout = {
      coord: { x: 1, z: 0 }, key: '1:0', isUrban: false,
      nodes: [{ id: 'node:128', x: 128, z: 0 }, { id: 'node:256', x: 256, z: 0 }],
      segments: [{ id: 'road:east', startNodeId: 'node:128', endNodeId: 'node:256', type: 'local', width: 7 }], blocks: [], parcels: []
    };
    const network = buildUrbanMobilityNetwork([east, west], defaultGameConfig.city.mobility);
    expect(network.laneConnections.some((connection) => connection.intersectionId === 'lane-junction:node:128')).toBe(true);
    expect(network.pedestrianConnections.some((connection) => connection.type === 'corner')).toBe(true);
  });
});
