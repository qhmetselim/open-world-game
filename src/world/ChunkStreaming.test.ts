import { describe, expect, it } from 'vitest';
import { isOutsideUnloadRadius, StreamingFocusTracker } from './ChunkStreaming';

describe('chunk streaming decisions', () => {
  it('only reports a streaming refresh after the focus crosses a chunk boundary', () => {
    const tracker = new StreamingFocusTracker();

    expect(tracker.update({ x: 0, z: 0 }, 128)).toEqual({ x: 0, z: 0 });
    expect(tracker.update({ x: 127.99, z: 1 }, 128)).toBeUndefined();
    expect(tracker.update({ x: 128, z: 1 }, 128)).toEqual({ x: 1, z: 0 });
  });

  it('retains chunks within the larger unload radius for hysteresis', () => {
    const focus = { x: 3, z: 0 };

    expect(isOutsideUnloadRadius({ x: 0, z: 0 }, focus, 3)).toBe(false);
    expect(isOutsideUnloadRadius({ x: -1, z: 0 }, focus, 3)).toBe(true);
  });
});
