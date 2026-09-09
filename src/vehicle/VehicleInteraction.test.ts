import { describe, expect, it } from 'vitest';
import { defaultGameConfig } from '../core/Config';
import { findSafeExitCandidate, getVehicleExitCandidates, isVehicleEnterEligible } from './VehicleInteraction';
import { createVehicleState } from './VehicleState';

describe('vehicle interaction logic', () => {
  it('requires proximity and an unoccupied vehicle before entry', () => {
    const vehicle = createVehicleState('sedan', { x: 0, y: 0, z: 0 }, 0);
    expect(isVehicleEnterEligible({ x: 3, z: 0 }, vehicle, 5)).toBe(true);
    vehicle.occupied = true;
    expect(isVehicleEnterEligible({ x: 3, z: 0 }, vehicle, 5)).toBe(false);
  });

  it('prioritizes driver-side safe exit and keeps a blocked exit unresolved', () => {
    const vehicle = createVehicleState('sedan', { x: 0, y: 0, z: 0 }, 0);
    const candidates = getVehicleExitCandidates(vehicle, defaultGameConfig.vehicle);
    expect(candidates[0]?.label).toBe('driver');
    expect(findSafeExitCandidate(candidates, (candidate) => candidate.label === 'rearRight')?.label).toBe('rearRight');
    expect(findSafeExitCandidate(candidates, () => false)).toBeUndefined();
  });
});
