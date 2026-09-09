import { describe, expect, it } from 'vitest';
import { FixedStepAccumulator } from './GameLoop';

describe('FixedStepAccumulator', () => {
  it('converts accumulated frame time to fixed simulation steps', () => {
    const accumulator = new FixedStepAccumulator();

    expect(accumulator.consume(0.01, 1 / 60, 5)).toBe(0);
    expect(accumulator.consume(0.01, 1 / 60, 5)).toBe(1);
  });

  it('caps work and drops excess time to prevent a spiral of death', () => {
    const accumulator = new FixedStepAccumulator();

    expect(accumulator.consume(1, 1 / 60, 3)).toBe(3);
    expect(accumulator.consume(0, 1 / 60, 3)).toBe(0);
  });
});
