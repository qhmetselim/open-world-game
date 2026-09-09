import type { GameConfig } from '../core/Config';
import { chunkCoordKey, chunkCoordToWorldOrigin } from './ChunkCoord';
import type { ChunkCoord, WorldPosition } from './ChunkCoord';
import { DeterministicNoise2D, hashStringToSeed } from './SeededNoise';

export interface GeneratedTerrainChunk {
  readonly coord: ChunkCoord;
  readonly key: string;
  readonly origin: WorldPosition;
  readonly resolution: number;
  readonly heights: Float32Array;
}

export class TerrainGenerator {
  private readonly noise: DeterministicNoise2D;

  public constructor(private readonly config: GameConfig['world']) {
    this.noise = new DeterministicNoise2D(hashStringToSeed(config.seed));
  }

  public getHeight(worldX: number, worldZ: number): number {
    let total = 0;
    let amplitude = 1;
    let frequency = this.config.terrain.frequency;
    let amplitudeSum = 0;

    for (let octave = 0; octave < this.config.terrain.octaves; octave += 1) {
      total += this.noise.sample(worldX * frequency, worldZ * frequency) * amplitude;
      amplitudeSum += amplitude;
      amplitude *= this.config.terrain.persistence;
      frequency *= this.config.terrain.lacunarity;
    }

    return this.config.terrain.baseHeight + (total / amplitudeSum) * this.config.terrain.amplitude;
  }

  public generateChunk(coord: ChunkCoord): GeneratedTerrainChunk {
    const origin = chunkCoordToWorldOrigin(coord, this.config.chunkSize);
    const verticesPerSide = this.config.terrainResolution + 1;
    const heights = new Float32Array(verticesPerSide * verticesPerSide);
    const vertexSpacing = this.config.chunkSize / this.config.terrainResolution;

    for (let z = 0; z < verticesPerSide; z += 1) {
      for (let x = 0; x < verticesPerSide; x += 1) {
        heights[z * verticesPerSide + x] = this.getHeight(origin.x + x * vertexSpacing, origin.z + z * vertexSpacing);
      }
    }

    return { coord, key: chunkCoordKey(coord), origin, resolution: this.config.terrainResolution, heights };
  }
}
