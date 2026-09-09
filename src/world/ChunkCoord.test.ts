import { describe, expect, it } from 'vitest';
import {
  chunkCoordKey,
  chunkCoordToWorldOrigin,
  worldPositionToChunkCoord
} from './ChunkCoord';
import { calculateActiveChunkCoords } from './ChunkStreaming';

describe('chunk coordinates', () => {
  it('maps positive and negative world positions using floor semantics', () => {
    expect(worldPositionToChunkCoord({ x: 0, z: 127.99 }, 128)).toEqual({ x: 0, z: 0 });
    expect(worldPositionToChunkCoord({ x: 128, z: 256 }, 128)).toEqual({ x: 1, z: 2 });
    expect(worldPositionToChunkCoord({ x: -1, z: -128.01 }, 128)).toEqual({ x: -1, z: -2 });
  });

  it('converts coordinates back to stable world origins', () => {
    expect(chunkCoordToWorldOrigin({ x: -3, z: 4 }, 128)).toEqual({ x: -384, z: 512 });
  });

  it('creates a stable, parse-free map key', () => {
    expect(chunkCoordKey({ x: 4, z: -7 })).toBe('4:-7');
  });

  it('calculates and prioritizes every chunk in the active square', () => {
    const chunks = calculateActiveChunkCoords({ x: 2, z: -3 }, 1);

    expect(chunks).toHaveLength(9);
    expect(chunks[0]).toEqual({ x: 2, z: -3 });
    expect(chunks).toContainEqual({ x: 1, z: -4 });
    expect(chunks).toContainEqual({ x: 3, z: -2 });
  });
});
