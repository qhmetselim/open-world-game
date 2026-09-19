/** Cosmetic generation only; metres, independent of traffic/physics tuning. */
export const environmentConfig = {
  roadSpacing: 18, scatterCellSize: 32, queryMargin: 32,
  intersectionClearance: 9, buildingClearance: 1.2, entranceClearance: 4,
  spawnClearance: 9, roadsideGap: 0.45, maxGroundVariation: 0.3,
  smallDistance: 100, largeDistance: 260, cullHysteresis: 12,
  maxPropsPerChunk: 80,
  profiles: {
    residential: { roadsideDensity: 0.82, vegetationDensity: 0.35 },
    urban: { roadsideDensity: 0.92, vegetationDensity: 0.16 },
    outskirts: { roadsideDensity: 0.35, vegetationDensity: 0.48 }
  }
} as const;
