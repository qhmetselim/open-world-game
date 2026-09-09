import { describe, expect, it } from 'vitest';
import { Time } from './Time';

describe('Time', () => {
  it('clamps negative and oversized deltas while preserving elapsed time', () => {
    const time = new Time();

    expect(time.advance(-1, 0.1)).toEqual({ deltaSeconds: 0, elapsedSeconds: 0 });
    expect(time.advance(0.25, 0.1)).toEqual({ deltaSeconds: 0.1, elapsedSeconds: 0.1 });
  });

  it('resets elapsed time', () => {
    const time = new Time();
    time.advance(0.05, 0.1);
    time.reset();

    expect(time.advance(0.01, 0.1).elapsedSeconds).toBe(0.01);
  });
});
