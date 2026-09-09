import { describe, expect, it } from 'vitest';
import { defaultGameConfig } from '../core/Config';
import {
  approachAngle,
  calculateFacingYaw,
  calculateHorizontalVelocity,
  getCapsuleCenterHeight,
  resolveVerticalVelocity,
  shouldRecoverPlayer
} from './PlayerMovement';

const northFacingBasis = {
  forward: { x: 0, z: -1 },
  right: { x: 1, z: 0 }
};

describe('PlayerMovement', () => {
  it('moves relative to the camera basis', () => {
    const velocity = calculateHorizontalVelocity(
      { forward: true, backward: false, left: false, right: false, sprint: false },
      northFacingBasis,
      7,
      12
    );

    expect(velocity).toEqual({ x: 0, z: -7 });
  });

  it('normalizes diagonal movement instead of increasing its speed', () => {
    const velocity = calculateHorizontalVelocity(
      { forward: true, backward: false, left: false, right: true, sprint: false },
      northFacingBasis,
      7,
      12
    );

    expect(Math.hypot(velocity.x, velocity.z)).toBeCloseTo(7);
  });

  it('preserves A as camera-relative left and D as camera-relative right', () => {
    const left = calculateHorizontalVelocity(
      { forward: false, backward: false, left: true, right: false, sprint: false }, northFacingBasis, 7, 12
    );
    const right = calculateHorizontalVelocity(
      { forward: false, backward: false, left: false, right: true, sprint: false }, northFacingBasis, 7, 12
    );
    expect(left.x).toBe(-7);
    expect(left.z).toBeCloseTo(0);
    expect(right.x).toBe(7);
    expect(right.z).toBeCloseTo(0);
  });

  it('selects sprint speed only while sprinting', () => {
    const walk = calculateHorizontalVelocity(
      { forward: true, backward: false, left: false, right: false, sprint: false },
      northFacingBasis,
      7,
      12
    );
    const sprint = calculateHorizontalVelocity(
      { forward: true, backward: false, left: false, right: false, sprint: true },
      northFacingBasis,
      7,
      12
    );

    expect(Math.hypot(walk.x, walk.z)).toBe(7);
    expect(Math.hypot(sprint.x, sprint.z)).toBe(12);
  });

  it('calculates and smoothly approaches the movement facing direction', () => {
    expect(calculateFacingYaw({ x: 1, z: 0 })).toBeCloseTo(Math.PI / 2);
    expect(approachAngle(0, Math.PI, 0.4)).toBeCloseTo(0.4);
  });

  it('spawns the capsule center above the sampled terrain height', () => {
    expect(getCapsuleCenterHeight(5, defaultGameConfig.player)).toBeCloseTo(6.02);
  });

  it('allows grounded jumps but does not create an air jump', () => {
    expect(resolveVerticalVelocity(0, true, true, 1 / 60, defaultGameConfig.player)).toBe(8);
    expect(resolveVerticalVelocity(3, false, true, 1 / 60, defaultGameConfig.player)).toBeCloseTo(2.6);
  });

  it('identifies only positions below the configured safety threshold for recovery', () => {
    expect(shouldRecoverPlayer(-60.01, -60)).toBe(true);
    expect(shouldRecoverPlayer(-60, -60)).toBe(false);
  });
});
