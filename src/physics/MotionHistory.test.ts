import { describe, expect, it } from 'vitest';
import { MotionHistory, rotationYaw, yawRotation } from './MotionHistory';
import { FixedStepAccumulator } from '../core/GameLoop';
import { assertFinitePhysics } from './PhysicsHealth';

describe('fixed simulation / render separation', () => {
  it('interpolates position and shortest quaternion arc, and resets teleports atomically', () => {
    const history = new MotionHistory();
    history.reset({ x: 0, y: 1, z: 0 }, yawRotation(179 * Math.PI / 180));
    history.capture({ x: 2, y: 3, z: 4 }, yawRotation(-179 * Math.PI / 180));
    const half = history.sample(.5);
    expect(half.position).toEqual({ x: 1, y: 2, z: 2 });
    expect(Math.abs(rotationYaw(half.rotation))).toBeCloseTo(Math.PI);
    history.reset({ x: 40, y: 1, z: 9 }, yawRotation(0));
    expect(history.sample(0).position).toEqual(history.sample(1).position);
  });
  it('runs equal 60Hz physics work at 30/60/120/144 render FPS and bounds spikes', () => {
    for (const fps of [30, 60, 120, 144]) {
      const accumulator = new FixedStepAccumulator(); let steps = 0;
      for (let i = 0; i < fps * 10; i++) { steps += accumulator.consume(1 / fps, 1 / 60, 5); expect(accumulator.alpha(1 / 60)).toBeGreaterThanOrEqual(0); expect(accumulator.alpha(1 / 60)).toBeLessThanOrEqual(1); }
      expect(steps).toBe(600);
    }
    const accumulator = new FixedStepAccumulator();
    for (const dt of [.016, .016, .1, .016]) expect(accumulator.consume(dt, 1 / 60, 5)).toBeLessThanOrEqual(5);
    expect(() => assertFinitePhysics('bad', [NaN, 0])).toThrow('Non-finite');
  });
});
