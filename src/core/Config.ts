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
    readonly mobility: {
      readonly trafficSide: 'right';
      readonly laneWidth: number;
      readonly sidewalkWidth: number;
      readonly curbWidth: number;
      readonly curbHeight: number;
      readonly surfaceOffset: number;
      readonly markingWidth: number;
      readonly crosswalkWidth: number;
      readonly crosswalkStripeWidth: number;
      readonly crosswalkStripeGap: number;
      readonly local: { readonly lanesPerDirection: number; readonly speedMetadata: number };
      readonly collector: { readonly lanesPerDirection: number; readonly speedMetadata: number };
      readonly arterial: { readonly lanesPerDirection: number; readonly speedMetadata: number };
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
  readonly vehicle: {
    readonly interaction: {
      readonly enterDistance: number;
      readonly exitDistance: number;
      readonly maxExitSpeed: number;
      readonly exitFeedbackSeconds: number;
    };
    readonly recovery: {
      readonly killY: number;
      readonly baseStreamingLookAhead: number;
      readonly maxStreamingLookAhead: number;
      readonly streamingLookAheadSpeedFactor: number;
    };
    readonly sedan: {
      readonly mass: number; readonly chassisWidth: number; readonly chassisHeight: number; readonly chassisLength: number;
      readonly wheelRadius: number; readonly wheelBase: number; readonly trackWidth: number;
      readonly suspensionRestLength: number; readonly suspensionStiffness: number; readonly suspensionDamping: number;
      readonly engineForce: number; readonly brakeForce: number; readonly reverseForce: number;
      readonly maxForwardSpeed: number; readonly maxReverseSpeed: number;
      readonly maxSteerAngle: number; readonly highSpeedSteerReduction: number; readonly steerResponse: number;
      readonly grip: number; readonly handbrakeGrip: number;
    };
    readonly camera: {
      readonly distance: number;
      readonly height: number;
      readonly targetHeight: number;
      readonly lookAhead: number;
      readonly smoothing: number;
      readonly mouseSensitivity: number;
      readonly minPitch: number;
      readonly maxPitch: number;
      readonly collisionPadding: number;
    };
  };
  readonly npc: {
    readonly activeRadius: number;
    readonly deactivateRadius: number;
    readonly maxActive: number;
    readonly populationNodeStride: number;
    readonly spawnBudgetPerUpdate: number;
    readonly walkSpeedMin: number;
    readonly walkSpeedMax: number;
    readonly rotationSpeed: number;
    readonly waypointReachDistance: number;
    readonly idleSecondsMin: number;
    readonly idleSecondsMax: number;
    readonly backgroundUpdateInterval: number;
    readonly separationRadius: number;
    readonly separationStrength: number;
    readonly spatialCellSize: number;
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
    },
    mobility: {
      trafficSide: 'right',
      laneWidth: 3.1,
      sidewalkWidth: 2.6,
      curbWidth: 0.22,
      curbHeight: 0.12,
      surfaceOffset: 0.12,
      markingWidth: 0.16,
      crosswalkWidth: 3.6,
      crosswalkStripeWidth: 0.48,
      crosswalkStripeGap: 0.46,
      local: { lanesPerDirection: 1, speedMetadata: 30 },
      collector: { lanesPerDirection: 1, speedMetadata: 45 },
      arterial: { lanesPerDirection: 2, speedMetadata: 60 }
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
    // Near the origin road corridor so the development sedan is walkable without bypassing the road-spawn rule.
    spawnPosition: { x: 12, z: 12 },
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
  },
  vehicle: {
    interaction: { enterDistance: 5, exitDistance: 3.2, maxExitSpeed: 1.2, exitFeedbackSeconds: 2.5 },
    recovery: {
      killY: -60,
      baseStreamingLookAhead: 10,
      maxStreamingLookAhead: 42,
      streamingLookAheadSpeedFactor: 1.25
    },
    sedan: {
      mass: 1_200, chassisWidth: 1.85, chassisHeight: 0.65, chassisLength: 4.2,
      wheelRadius: 0.36, wheelBase: 2.5, trackWidth: 1.5,
      suspensionRestLength: 0.38, suspensionStiffness: 26, suspensionDamping: 3.2,
      engineForce: 1_900, brakeForce: 34, reverseForce: 900, maxForwardSpeed: 31, maxReverseSpeed: 10,
      maxSteerAngle: 0.48, highSpeedSteerReduction: 0.62, steerResponse: 4.5, grip: 1.8, handbrakeGrip: 0.65
    },
    camera: {
      distance: 8.5,
      height: 3.1,
      targetHeight: 1.15,
      lookAhead: 2.8,
      smoothing: 9,
      mouseSensitivity: 0.002,
      minPitch: -0.3,
      maxPitch: 0.58,
      collisionPadding: 0.35
    }
  },
  npc: {
    activeRadius: 180,
    deactivateRadius: 220,
    maxActive: 20,
    populationNodeStride: 2,
    spawnBudgetPerUpdate: 3,
    walkSpeedMin: 1.15,
    walkSpeedMax: 1.75,
    rotationSpeed: 8,
    waypointReachDistance: 0.35,
    idleSecondsMin: 1,
    idleSecondsMax: 4,
    backgroundUpdateInterval: 3,
    separationRadius: 1.15,
    separationStrength: 1.5,
    spatialCellSize: 3
  }
};
