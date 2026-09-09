import { describe, expect, it } from 'vitest';
import { defaultGameConfig } from '../core/Config';
import { buildStreetMeshData } from './MobilityGeometry';
import { buildUrbanMobilityNetwork } from './UrbanMobility';
import type { CityRegionLayout } from './CityTypes';

const layout: CityRegionLayout = {
  coord: { x: 0, z: 0 }, key: '0:0', isUrban: false,
  nodes: [{ id: 'node:0', x: 0, z: 0 }, { id: 'node:256', x: 256, z: 0 }],
  segments: [{ id: 'road:test', startNodeId: 'node:0', endNodeId: 'node:256', type: 'arterial', width: 13 }], blocks: [], parcels: []
};

describe('mobility street geometry', () => {
  it('batches terrain-following sidewalks, curbs, lane markings, and chunk-continuous boundaries', () => {
    const network = buildUrbanMobilityNetwork([layout], defaultGameConfig.city.mobility);
    const first = buildStreetMeshData([layout], network, { minX: 0, maxX: 128, minZ: -32, maxZ: 32 }, (x) => x * 0.01, defaultGameConfig.city.mobility, 16);
    const second = buildStreetMeshData([layout], network, { minX: 128, maxX: 256, minZ: -32, maxZ: 32 }, (x) => x * 0.01, defaultGameConfig.city.mobility, 16);
    expect(first.sidewalk.indices.length).toBeGreaterThan(0);
    expect(first.curb.indices.length).toBeGreaterThan(0);
    expect(first.marking.indices.length).toBeGreaterThan(0);
    expect(first.visibleLaneCount).toBeGreaterThan(0);
    expect(first.visibleSidewalkSegmentCount).toBe(2);
    const firstSideLength = first.sidewalk.positions.length / 2;
    expect(first.sidewalk.positions.slice(firstSideLength - 6, firstSideLength)).toEqual(second.sidewalk.positions.slice(0, 6));
  });
});
