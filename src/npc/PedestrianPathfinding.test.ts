import { describe, expect, it } from 'vitest';
import { findPedestrianPath } from './PedestrianPathfinding';

const nodes = [
  { id: 'a', position: { x: -128, z: 0 }, roadId: 'west', side: 'left' as const, connectionIds: [] },
  { id: 'b', position: { x: 0, z: 0 }, roadId: 'west', side: 'left' as const, connectionIds: [] },
  { id: 'c', position: { x: 0, z: 8 }, roadId: 'east', side: 'right' as const, connectionIds: [] },
  { id: 'd', position: { x: 128, z: 8 }, roadId: 'east', side: 'right' as const, connectionIds: [] }
];
const connections = [
  { id: 'west', fromNodeId: 'a', toNodeId: 'b', type: 'sidewalk' as const },
  { id: 'cross', fromNodeId: 'b', toNodeId: 'c', type: 'crossing' as const },
  { id: 'east', fromNodeId: 'c', toNodeId: 'd', type: 'sidewalk' as const }
];

describe('pedestrian A*', () => {
  it('finds deterministic paths that can cross road crossings and chunk boundaries', () => {
    expect(findPedestrianPath('a', 'd', nodes, connections)).toEqual(['a', 'b', 'c', 'd']);
    expect(findPedestrianPath('a', 'd', nodes, connections)).toEqual(['a', 'b', 'c', 'd']);
  });
  it('returns undefined for unreachable destinations without loops', () => {
    expect(findPedestrianPath('a', 'missing', nodes, connections)).toBeUndefined();
    expect(findPedestrianPath('d', 'a', nodes, connections.slice(0, 1))).toBeUndefined();
  });
});
