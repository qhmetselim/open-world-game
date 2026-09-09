import { describe, expect, it } from 'vitest';
import { createNpcAppearance, createNpcIdentity } from './NpcIdentity';
import { serializeNpcState } from './NpcTypes';

describe('deterministic NPC identity', () => {
  it('keeps identity, name, speed, and appearance stable for a world seed and id', () => {
    const first = createNpcIdentity('world-a', 'npc:1', 'district:a', 1, 2);
    const second = createNpcIdentity('world-a', 'npc:1', 'district:a', 1, 2);
    expect(second).toEqual(first);
    expect(createNpcAppearance(first.appearanceSeed)).toEqual(createNpcAppearance(second.appearanceSeed));
    expect(createNpcIdentity('world-a', 'npc:2', 'district:a', 1, 2).displayName).not.toBe(first.displayName);
  });

  it('serializes plain NPC state without render references', () => {
    const state = { id: 'npc:1', position: { x: -2, y: 0, z: 3 }, facingYaw: 0, currentNodeId: 'a', destinationNodeId: 'b', pathNodeIds: ['a', 'b'], pathIndex: 0, activity: 'walking' as const, tier: 'active' as const, idleRemaining: 0, tripIndex: 2, backgroundElapsed: 0, appearance: createNpcAppearance(1) };
    expect(serializeNpcState(state)).toEqual(state);
  });
});
