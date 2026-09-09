import { describe, expect, it } from 'vitest';
import { defaultGameConfig } from '../core/Config';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { findSafeExitCandidate, getVehicleExitCandidates } from './VehicleInteraction';
import { createVehicleState } from './VehicleState';

describe('safe vehicle exit collision queries', () => {
  it('skips blocked candidates and refuses exit when every candidate is occupied', async () => {
    const physics = new PhysicsWorld();
    await physics.initialize();
    const vehicle = createVehicleState('sedan', { x: 0, y: 1, z: 0 }, 0);
    const candidates = getVehicleExitCandidates(vehicle, defaultGameConfig.vehicle);
    const blockers = candidates.map((candidate) => physics.createStaticCuboid([candidate.x, 1, candidate.z], [0.25, 2, 0.25], 0));
    physics.step(1 / 60);
    const isSafe = (candidate: (typeof candidates)[number]): boolean => physics.isCapsulePositionClear(
      [candidate.x, 1, candidate.z],
      defaultGameConfig.player.capsuleHalfHeight,
      defaultGameConfig.player.capsuleRadius,
      undefined
    );
    expect(findSafeExitCandidate(candidates, isSafe)).toBeUndefined();
    const released = blockers.shift();
    if (released === undefined) throw new Error('Expected a driver-side blocker.');
    physics.removeRigidBody(released);
    physics.step(1 / 60);
    expect(findSafeExitCandidate(candidates, isSafe)?.label).toBe('driver');
    for (const blocker of blockers) physics.removeRigidBody(blocker);
    physics.dispose();
  });
});
