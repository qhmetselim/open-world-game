import { describe, expect, it } from 'vitest';
import { defaultGameConfig } from '../core/Config';
import {
  clampCameraPitch,
  getCameraRelativeBasis,
  getThirdPersonDesiredPosition
} from './ThirdPersonCameraMath';

describe('third-person camera math', () => {
  it('clamps pitch within the configured limits', () => {
    expect(clampCameraPitch(2, -0.45, 0.7)).toBe(0.7);
    expect(clampCameraPitch(-2, -0.45, 0.7)).toBe(-0.45);
  });

  it('returns horizontal movement directions that ignore camera pitch', () => {
    expect(getCameraRelativeBasis(0)).toEqual({ forward: { x: 0, z: -1 }, right: { x: 1, z: 0 } });
  });

  it('places the desired camera behind and above the player target', () => {
    expect(getThirdPersonDesiredPosition({ x: 0, y: 1, z: 0 }, 0, 0, defaultGameConfig.camera)).toEqual({
      x: 0,
      y: 2.25,
      z: 6
    });
  });
});
