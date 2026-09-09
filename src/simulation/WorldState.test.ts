import { describe, expect, it } from 'vitest';
import { createEntityState } from './Entity';
import { WorldState } from './WorldState';
import { createPlayerState, serializePlayerState } from '../player/PlayerState';

describe('WorldState', () => {
  it('serializes simulation-only entities and region activity', () => {
    const world = new WorldState('open-world-test');
    world.addEntity(createEntityState('test:box', 'test', [1, 2, 3]));
    world.setRegionActive('origin', true);

    expect(world.serialize()).toEqual({
      seed: 'open-world-test',
      entities: [{ id: 'test:box', kind: 'test', position: [1, 2, 3], active: true }],
      regions: [{ id: 'origin', active: true }]
    });
  });

  it('retains an optional serializable player state without renderer references', () => {
    const world = new WorldState('open-world-test');
    world.setPlayerState(serializePlayerState(createPlayerState({ x: 4, y: 2, z: -3 })));

    expect(world.serialize().player?.position).toEqual({ x: 4, y: 2, z: -3 });
  });
});
