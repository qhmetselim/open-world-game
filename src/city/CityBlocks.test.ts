import { describe, expect, it } from 'vitest';
import { defaultGameConfig } from '../core/Config';
import { CityLayoutGenerator } from './CityLayoutGenerator';

describe('city block and parcel foundation', () => {
  const layout = new CityLayoutGenerator(defaultGameConfig.world.seed, defaultGameConfig.city, () => 0).generateRegion({ x: 0, z: 0 });

  it('keeps generated blocks inside configured buildable dimensions', () => {
    for (const block of layout.blocks) {
      const width = block.bounds.maxX - block.bounds.minX;
      const depth = block.bounds.maxZ - block.bounds.minZ;
      expect(width).toBeGreaterThanOrEqual(defaultGameConfig.city.road.minBlockSize);
      expect(depth).toBeGreaterThanOrEqual(defaultGameConfig.city.road.minBlockSize);
      expect(width).toBeLessThanOrEqual(defaultGameConfig.city.road.maxBlockSize);
      expect(depth).toBeLessThanOrEqual(defaultGameConfig.city.road.maxBlockSize);
      expect(block.area).toBeCloseTo(width * depth);
    }
  });

  it('creates one valid deterministic buildable parcel per block', () => {
    expect(layout.blocks.length).toBeGreaterThan(0);
    expect(layout.parcels).toHaveLength(layout.blocks.length);
    for (const parcel of layout.parcels) {
      const block = layout.blocks.find((candidate) => candidate.id === parcel.blockId);
      expect(block).toBeDefined();
      expect(parcel.width).toBeGreaterThan(0);
      expect(parcel.depth).toBeGreaterThan(0);
      expect(parcel.facingRoadId).not.toBe('road:none');
      expect(parcel.center.x).toBeGreaterThanOrEqual(block?.bounds.minX ?? Number.POSITIVE_INFINITY);
      expect(parcel.center.x).toBeLessThanOrEqual(block?.bounds.maxX ?? Number.NEGATIVE_INFINITY);
      expect(parcel.center.z).toBeGreaterThanOrEqual(block?.bounds.minZ ?? Number.POSITIVE_INFINITY);
      expect(parcel.center.z).toBeLessThanOrEqual(block?.bounds.maxZ ?? Number.NEGATIVE_INFINITY);
    }
  });

  it('keeps road graph nodes outside block interiors', () => {
    for (const node of layout.nodes) {
      for (const block of layout.blocks) {
        const inside = node.x > block.bounds.minX && node.x < block.bounds.maxX && node.z > block.bounds.minZ && node.z < block.bounds.maxZ;
        expect(inside).toBe(false);
      }
    }
  });
});
