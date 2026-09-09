import { describe, expect, it } from 'vitest';
import { shouldActivateNpc, stepNpcTowardWaypoint } from './NpcMovement';
import { createNpcAppearance } from './NpcIdentity';
import { getNpcFeetOffset } from '../render/NpcView';

function state() { return { id: 'npc', position: { x: 0, y: 0, z: 0 }, facingYaw: 0, currentNodeId: 'a', destinationNodeId: 'b', pathNodeIds: ['a', 'b'], pathIndex: 0, activity: 'walking' as const, tier: 'active' as const, idleRemaining: 0, tripIndex: 0, backgroundElapsed: 0, appearance: createNpcAppearance(1) }; }

describe('NPC movement and tier hysteresis', () => {
  it('walks smoothly toward a waypoint, faces it, and reaches the node', () => {
    const npc = state();
    expect(stepNpcTowardWaypoint(npc, { id: 'b', position: { x: 2, z: 0 }, roadId: 'road', side: 'left', connectionIds: [] }, 2, .1, .25)).toBe(false);
    expect(npc.position.x).toBeCloseTo(.5);
    expect(npc.facingYaw).toBeGreaterThan(0);
    expect(stepNpcTowardWaypoint(npc, { id: 'b', position: { x: .55, z: 0 }, roadId: 'road', side: 'left', connectionIds: [] }, 2, .1, .25)).toBe(true);
    expect(npc.currentNodeId).toBe('b');
  });
  it('uses active/deactivate radii as hysteresis', () => {
    expect(shouldActivateNpc(80, 78, 102, false)).toBe(false);
    expect(shouldActivateNpc(80, 78, 102, true)).toBe(true);
    expect(shouldActivateNpc(103, 78, 102, true)).toBe(false);
  });
  it('interpolates waypoint surface elevation and keeps procedural feet above that surface', () => {
    const npc = state();
    expect(stepNpcTowardWaypoint(npc, { id: 'b', position: { x: 4, z: 0 }, roadId: 'road', side: 'left', connectionIds: [] }, 2, .1, .5, 2)).toBe(false);
    expect(npc.position.x).toBeCloseTo(1);
    expect(npc.position.y).toBeCloseTo(.5);
    expect(getNpcFeetOffset(.9)).toBeCloseTo(.954);
    expect(getNpcFeetOffset(1.1)).toBeCloseTo(1.166);
  });
});
