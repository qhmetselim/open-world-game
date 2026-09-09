import { describe, expect, it } from 'vitest';
import { defaultGameConfig } from '../core/Config';
import { TerrainGenerator } from './TerrainGenerator';

describe('TerrainGenerator', () => {
  it('returns identical heights from generators configured with the same seed', () => {
    const first = new TerrainGenerator(defaultGameConfig.world);
    const second = new TerrainGenerator(defaultGameConfig.world);

    expect(first.getHeight(23.5, -81.25)).toBe(second.getHeight(23.5, -81.25));
  });

  it('changes height output with a different world seed', () => {
    const first = new TerrainGenerator(defaultGameConfig.world);
    const second = new TerrainGenerator({ ...defaultGameConfig.world, seed: 'different-world' });

    expect(first.getHeight(23.5, -81.25)).not.toBe(second.getHeight(23.5, -81.25));
  });

  it('generates exactly matching vertex heights on an adjacent chunk border', () => {
    const generator = new TerrainGenerator(defaultGameConfig.world);
    const west = generator.generateChunk({ x: 0, z: 0 });
    const east = generator.generateChunk({ x: 1, z: 0 });
    const verticesPerSide = west.resolution + 1;

    for (let z = 0; z < verticesPerSide; z += 1) {
      expect(west.heights[z * verticesPerSide + west.resolution]).toBe(east.heights[z * verticesPerSide]);
    }
  });
});
