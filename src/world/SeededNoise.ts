export function hashStringToSeed(seed: string): number {
  let hash = 2_166_136_261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

function hashLattice(x: number, z: number, seed: number): number {
  let value = Math.imul(x, 374_761_393) ^ Math.imul(z, 668_265_263) ^ seed;
  value = Math.imul(value ^ (value >>> 13), 1_274_126_177);
  return (value ^ (value >>> 16)) >>> 0;
}

function smoothstep(value: number): number {
  return value * value * (3 - 2 * value);
}

function interpolate(left: number, right: number, amount: number): number {
  return left + (right - left) * amount;
}

export class DeterministicNoise2D {
  public constructor(private readonly seed: number) {}

  public sample(x: number, z: number): number {
    const x0 = Math.floor(x);
    const z0 = Math.floor(z);
    const xFraction = x - x0;
    const zFraction = z - z0;
    const lowerLeft = hashLattice(x0, z0, this.seed) / 0xffff_ffff;
    const lowerRight = hashLattice(x0 + 1, z0, this.seed) / 0xffff_ffff;
    const upperLeft = hashLattice(x0, z0 + 1, this.seed) / 0xffff_ffff;
    const upperRight = hashLattice(x0 + 1, z0 + 1, this.seed) / 0xffff_ffff;
    const lower = interpolate(lowerLeft, lowerRight, smoothstep(xFraction));
    const upper = interpolate(upperLeft, upperRight, smoothstep(xFraction));
    return interpolate(lower, upper, smoothstep(zFraction)) * 2 - 1;
  }
}
