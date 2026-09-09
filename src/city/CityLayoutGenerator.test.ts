import { describe, expect, it } from 'vitest';
import { defaultGameConfig } from '../core/Config';
import { CityLayoutCache } from './CityLayoutCache';
import { CityLayoutGenerator, isRoadGradeSafe } from './CityLayoutGenerator';

const flatTerrain = (): number => 0;

function createGenerator(seed = defaultGameConfig.world.seed): CityLayoutGenerator {
  return new CityLayoutGenerator(seed, defaultGameConfig.city, flatTerrain);
}

describe('CityLayoutGenerator', () => {
  it('generates identical road graph, blocks, and parcels for the same seed and region', () => {
    const first = createGenerator().generateRegion({ x: 0, z: 0 });
    const second = createGenerator().generateRegion({ x: 0, z: 0 });

    expect(second).toEqual(first);
  });

  it('changes the layout meaningfully for a different seed', () => {
    const first = createGenerator('open-world-001').generateRegion({ x: 2, z: -3 });
    const second = createGenerator('another-world').generateRegion({ x: 2, z: -3 });

    expect(second.nodes).not.toEqual(first.nodes);
    expect(second.segments).not.toEqual(first.segments);
  });

  it('is independent of region generation order', () => {
    const first = createGenerator();
    const second = createGenerator();
    first.generateRegion({ x: -2, z: 4 });
    const expected = first.generateRegion({ x: 3, z: -1 });
    const actual = second.generateRegion({ x: 3, z: -1 });
    second.generateRegion({ x: -2, z: 4 });

    expect(actual).toEqual(expected);
  });

  it('continues arterial edge nodes across adjacent regions with stable IDs', () => {
    const generator = createGenerator();
    const west = generator.generateRegion({ x: 0, z: 0 });
    const east = generator.generateRegion({ x: 1, z: 0 });
    const edgeX = defaultGameConfig.city.regionSize;
    const westEdgeIds = west.nodes.filter((node) => node.x === edgeX).map((node) => node.id).sort();
    const eastEdgeIds = east.nodes.filter((node) => node.x === edgeX).map((node) => node.id).sort();

    expect(westEdgeIds).not.toHaveLength(0);
    expect(eastEdgeIds).toEqual(expect.arrayContaining(westEdgeIds));
    expect(west.segments.map((segment) => segment.id)).toEqual([...west.segments.map((segment) => segment.id)].sort());
  });

  it('forces the spawn region to urban and creates stable graph IDs', () => {
    const layout = createGenerator().generateRegion({ x: 0, z: 0 });
    const allIds = [...layout.nodes.map((node) => node.id), ...layout.segments.map((segment) => segment.id)];

    expect(layout.isUrban).toBe(true);
    expect(layout.blocks.length).toBeGreaterThan(0);
    expect(layout.parcels.length).toBeGreaterThan(0);
    expect(layout.segments.filter((segment) => segment.type === 'arterial').every((segment) => segment.width === defaultGameConfig.city.road.arterialWidth)).toBe(true);
    expect(layout.segments.filter((segment) => segment.type === 'local').every((segment) => segment.width === defaultGameConfig.city.road.localWidth)).toBe(true);
    expect(new Set(allIds).size).toBe(allIds.length);
    expect(new Set(layout.blocks.map((block) => block.id)).size).toBe(layout.blocks.length);
    expect(new Set(layout.parcels.map((parcel) => parcel.id)).size).toBe(layout.parcels.length);
  });

  it('regenerates an evicted region with the exact same layout', () => {
    const cache = new CityLayoutCache(defaultGameConfig.world.seed, { ...defaultGameConfig.city, layoutCacheSize: 2 }, flatTerrain);
    const first = cache.getRegion({ x: 0, z: 0 });
    cache.getRegion({ x: 1, z: 0 });
    cache.getRegion({ x: 2, z: 0 });
    const reloaded = cache.getRegion({ x: 0, z: 0 });

    expect(reloaded).toEqual(first);
    expect(cache.cachedRegionCount).toBeLessThanOrEqual(2);
  });

  it('rejects a road candidate whose sampled terrain grade exceeds the configured limit', () => {
    expect(isRoadGradeSafe({ x: 0, z: 0 }, { x: 10, z: 0 }, (x) => x, 0.2, 2)).toBe(false);
    expect(isRoadGradeSafe({ x: 0, z: 0 }, { x: 10, z: 0 }, (x) => x * 0.05, 0.2, 2)).toBe(true);
  });
});
