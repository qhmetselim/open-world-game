import { describe, expect, it } from 'vitest';
import { DeterministicNoise2D, hashStringToSeed } from './SeededNoise';

describe('deterministic noise', () => {
  it('maps equal seed strings to the same numeric representation and samples', () => {
    const seed = hashStringToSeed('open-world-001');
    const first = new DeterministicNoise2D(seed);
    const second = new DeterministicNoise2D(seed);

    expect(hashStringToSeed('open-world-001')).toBe(seed);
    expect(first.sample(3.125, -9.5)).toBe(second.sample(3.125, -9.5));
  });

  it('produces a different procedural field for a different seed', () => {
    const first = new DeterministicNoise2D(hashStringToSeed('open-world-001'));
    const second = new DeterministicNoise2D(hashStringToSeed('open-world-002'));

    expect(first.sample(37.25, -14.75)).not.toBe(second.sample(37.25, -14.75));
  });
});
