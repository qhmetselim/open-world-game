import { describe, expect, it } from 'vitest';
import { SpatialHash } from './SpatialHash';

describe('NPC spatial hash', () => {
  it('upserts, updates, queries negative coordinates, and cleans up entries', () => {
    const hash = new SpatialHash<{ id: string; position: { x: number; z: number } }>(2);
    hash.upsert({ id: 'a', position: { x: -1, z: -1 } });
    hash.upsert({ id: 'b', position: { x: 3, z: 0 } });
    expect(hash.nearby({ x: -1, z: -1 }, 1)).toHaveLength(1);
    hash.upsert({ id: 'a', position: { x: 4, z: 0 } });
    expect(hash.nearby({ x: -1, z: -1 }, 1)).toHaveLength(0);
    expect(hash.nearby({ x: 3, z: 0 }, 2).map((entry) => entry.id).sort()).toEqual(['a', 'b']);
    hash.remove('a');
    expect(hash.nearby({ x: 3, z: 0 }, 2).map((entry) => entry.id)).toEqual(['b']);
    hash.remove('b');
    expect(hash.cellCount).toBe(0);
  });
});
