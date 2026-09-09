export interface GameConfig {
  readonly physics: {
    readonly fixedTimeStep: number;
    readonly maxSubSteps: number;
    readonly maxDeltaSeconds: number;
  };
  readonly rendering: {
    readonly maxPixelRatio: number;
    readonly shadowsEnabled: boolean;
  };
  readonly diagnostics: {
    readonly enabled: boolean;
    readonly showChunkBorders: boolean;
  };
  readonly world: {
    readonly seed: string;
    readonly chunkSize: number;
    readonly terrainResolution: number;
    readonly activeChunkRadius: number;
    readonly unloadChunkRadius: number;
    readonly terrain: {
      readonly baseHeight: number;
      readonly amplitude: number;
      readonly frequency: number;
      readonly octaves: number;
      readonly lacunarity: number;
      readonly persistence: number;
    };
  };
}

export const defaultGameConfig: GameConfig = {
  physics: {
    fixedTimeStep: 1 / 60,
    maxSubSteps: 5,
    maxDeltaSeconds: 0.1
  },
  rendering: {
    maxPixelRatio: 2,
    shadowsEnabled: true
  },
  diagnostics: {
    enabled: import.meta.env.DEV,
    showChunkBorders: import.meta.env.DEV
  },
  world: {
    seed: 'open-world-001',
    chunkSize: 128,
    terrainResolution: 24,
    activeChunkRadius: 2,
    unloadChunkRadius: 3,
    terrain: {
      baseHeight: 0,
      amplitude: 7,
      frequency: 0.0035,
      octaves: 4,
      lacunarity: 2,
      persistence: 0.5
    }
  }
};
