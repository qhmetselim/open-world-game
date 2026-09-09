import { describe, expect, it } from 'vitest';
import { createEntityState } from './Entity';
import { WorldState } from './WorldState';

describe('WorldState', () => {
  it('serializes simulation-only entities and region activity', () => {
    const world = new WorldState(1234);
    world.addEntity(createEntityState('test:box', 'test', [1, 2, 3]));
    world.setRegionActive('origin', true);

    expect(world.serialize()).toEqual({
      seed: 1234,
      entities: [{ id: 'test:box', kind: 'test', position: [1, 2, 3], active: true }],
      regions: [{ id: 'origin', active: true }]
    });
  });
});
