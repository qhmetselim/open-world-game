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
  readonly city: {
    readonly regionSize: number;
    readonly urbanSpawnRadius: number;
    readonly urbanChance: number;
    readonly layoutCacheSize: number;
    readonly road: {
      readonly arterialWidth: number;
      readonly localWidth: number;
      readonly localRoadSpacing: number;
      readonly minBlockSize: number;
      readonly maxBlockSize: number;
      readonly maxRoadGrade: number;
      readonly surfaceOffset: number;
      readonly sampleSpacing: number;
      readonly regionMargin: number;
      readonly parcelInset: number;
    };
  };
  readonly building: {
    readonly layoutCacheSize: number;
    readonly urbanOccupancy: number;
    readonly floorHeight: number;
    readonly spawnSafetyRadius: number;
    readonly foundation: {
      readonly heightPadding: number;
      readonly minimumHeight: number;
    };
    readonly setbacks: {
      readonly front: number;
      readonly side: number;
      readonly rear: number;
    };
    readonly residential: { readonly minFloors: number; readonly maxFloors: number };
    readonly commercial: { readonly minFloors: number; readonly maxFloors: number };
    readonly mixedUse: { readonly minFloors: number; readonly maxFloors: number };
    readonly window: {
      readonly minimumWidth: number;
      readonly targetSpacing: number;
      readonly height: number;
      readonly depth: number;
    };
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
  readonly player: {
    readonly walkSpeed: number;
    readonly sprintSpeed: number;
    readonly jumpSpeed: number;
    readonly gravity: number;
    readonly capsuleRadius: number;
    readonly capsuleHalfHeight: number;
    readonly controllerOffset: number;
    readonly maxSlopeAngleRadians: number;
    readonly rotationSpeed: number;
    readonly spawnPosition: { readonly x: number; readonly z: number };
    readonly killY: number;
  };
  readonly camera: {
    readonly distance: number;
    readonly targetHeight: number;
    readonly mouseSensitivity: number;
    readonly minPitch: number;
    readonly maxPitch: number;
    readonly smoothing: number;
    readonly collisionPadding: number;
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
  city: {
    regionSize: 512,
    urbanSpawnRadius: 1,
    urbanChance: 0.32,
    layoutCacheSize: 48,
    road: {
      arterialWidth: 13,
      localWidth: 7,
      localRoadSpacing: 112,
      minBlockSize: 48,
      maxBlockSize: 156,
      maxRoadGrade: 0.18,
      surfaceOffset: 0.08,
      sampleSpacing: 12,
      regionMargin: 28,
      parcelInset: 5
    }
  },
  building: {
    layoutCacheSize: 48,
    urbanOccupancy: 0.82,
    floorHeight: 3,
    spawnSafetyRadius: 20,
    foundation: {
      heightPadding: 0.15,
      minimumHeight: 0.35
    },
    setbacks: {
      front: 5,
      side: 4,
      rear: 4
    },
    residential: { minFloors: 3, maxFloors: 7 },
    commercial: { minFloors: 1, maxFloors: 3 },
    mixedUse: { minFloors: 4, maxFloors: 9 },
    window: {
      minimumWidth: 1.4,
      targetSpacing: 4.5,
      height: 1.45,
      depth: 0.08
    }
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
  },
  player: {
    walkSpeed: 7,
    sprintSpeed: 12,
    jumpSpeed: 8,
    gravity: 24,
    capsuleRadius: 0.4,
    capsuleHalfHeight: 0.6,
    controllerOffset: 0.02,
    maxSlopeAngleRadians: Math.PI / 4,
    rotationSpeed: 12,
    spawnPosition: { x: 2, z: 2 },
    killY: -60
  },
  camera: {
    distance: 6,
    targetHeight: 1.25,
    mouseSensitivity: 0.0025,
    minPitch: -0.45,
    maxPitch: 0.7,
    smoothing: 14,
    collisionPadding: 0.25
  }
};
