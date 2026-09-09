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
    enabled: import.meta.env.DEV
  }
};
