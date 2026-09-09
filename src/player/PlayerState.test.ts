import { describe, expect, it } from 'vitest';
import { createPlayerState, serializePlayerState } from './PlayerState';

describe('PlayerState', () => {
  it('serializes plain gameplay state without renderer objects', () => {
    const state = createPlayerState({ x: 1, y: 2, z: 3 });
    state.velocity.x = 4;
    state.grounded = true;
    state.facingYaw = 0.5;

    expect(serializePlayerState(state)).toEqual({
      position: { x: 1, y: 2, z: 3 },
      velocity: { x: 4, y: 0, z: 0 },
      grounded: true,
      facingYaw: 0.5
    });
  });
});
