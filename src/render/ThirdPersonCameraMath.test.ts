import { describe, expect, it } from 'vitest';
import { defaultGameConfig } from '../core/Config';
import {
  applyPointerLook,
  clampCameraPitch,
  getCameraRelativeBasis,
  getThirdPersonDesiredPosition,
  smoothCameraTarget
} from './ThirdPersonCameraMath';

describe('third-person camera math', () => {
  it('clamps pitch within the configured limits', () => {
    expect(clampCameraPitch(2, -0.45, 0.7)).toBe(0.7);
    expect(clampCameraPitch(-2, -0.45, 0.7)).toBe(-0.45);
  });

  it('maps positive horizontal pointer movement to a rightward yaw without changing vertical convention', () => {
    expect(applyPointerLook(0, 0.2, 12, 0, 0.01, -0.4, 0.7)).toEqual({ yaw: 0.12, pitch: 0.2 });
    expect(applyPointerLook(0, 0.2, -12, 0, 0.01, -0.4, 0.7)).toEqual({ yaw: -0.12, pitch: 0.2 });
    expect(applyPointerLook(0, 0.2, 0, 100, 0.01, -0.4, 0.7).pitch).toBe(-0.4);
  });

  it('returns horizontal movement directions that ignore camera pitch', () => {
    expect(getCameraRelativeBasis(0)).toEqual({ forward: { x: 0, z: -1 }, right: { x: 1, z: 0 } });
    const rightFacing = getCameraRelativeBasis(Math.PI / 2);
    expect(rightFacing.forward.x).toBeCloseTo(1);
    expect(rightFacing.forward.z).toBeCloseTo(0);
    expect(rightFacing.right.x).toBeCloseTo(0);
    expect(rightFacing.right.z).toBeCloseTo(1);
  });

  it('places the desired camera behind and above the player target', () => {
    expect(getThirdPersonDesiredPosition({ x: 0, y: 1, z: 0 }, 0, 0, defaultGameConfig.camera)).toEqual({
      x: 0,
      y: 2.25,
      z: 6
    });
  });

  it('smooths fixed-step vertical target changes without losing a finite jump target', () => {
    let target = { x: 0, y: 1.25, z: 0 };
    let largestFrameDelta = 0;
    for (let frame = 0; frame < 120; frame += 1) {
      const physicsTarget = { x: 0, y: 1.25 + (frame % 12 < 6 ? 1.8 : 0), z: 0 };
      const next = smoothCameraTarget(target, physicsTarget, 22, 1 / 60);
      largestFrameDelta = Math.max(largestFrameDelta, Math.abs(next.y - target.y));
      target = next;
    }
    expect(Number.isFinite(target.y)).toBe(true);
    expect(largestFrameDelta).toBeLessThan(1);
    expect(target.y).toBeGreaterThanOrEqual(1.25);
  });
});
