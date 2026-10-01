/** Visual family only: every variant still uses the unchanged sedan physics contract. */
export type VehicleVisualModel = 'hatchback' | 'sedan' | 'crossover' | 'police';
const civilianModels = ['hatchback', 'sedan', 'crossover'] as const;

/** Uses the existing deterministic identity without changing AI state or spawn choices. */
export function trafficVisualModel(appearanceSeed: number): Exclude<VehicleVisualModel, 'police'> {
  return civilianModels[(appearanceSeed >>> 5) % civilianModels.length]!;
}
