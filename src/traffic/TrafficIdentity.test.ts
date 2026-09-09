import { describe, expect, it } from 'vitest';
import { createTrafficIdentity } from './TrafficIdentity';

describe('traffic identity', () => {
  it('is stable for a world seed and meaningfully changes with another seed', () => {
    const first = createTrafficIdentity('open-world-001', 'lane:road:1:forward:0', .9, 1.05);
    expect(createTrafficIdentity('open-world-001', 'lane:road:1:forward:0', .9, 1.05)).toEqual(first);
    expect(createTrafficIdentity('another-world', 'lane:road:1:forward:0', .9, 1.05).appearanceSeed).not.toBe(first.appearanceSeed);
  });
});
