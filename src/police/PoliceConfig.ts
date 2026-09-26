export const policeConfig = {
  thresholds: [0, 1, 4, 8], crime: { weaponFired: 1, npcDamaged: 2, npcKilled: 4 },
  loseSightSeconds: 18, decaySeconds: 12, responseSeconds: 4,
  officersByLevel: [0, 1, 2, 4], carsByLevel: [0, 1, 1, 2],
  spawnMin: 38, spawnMax: 90, despawnDistance: 210, sightRange: 65,
  engageRange: 22, walkSpeed: 3.6, shotInterval: 1.6, damage: 9,
  replanSeconds: 1, cruiseSpeed: 11, deathResetSeconds: 3,
  drops: { max: 24, lifetime: 90, pickupRadius: 1.8, minKurus: 1500, variationKurus: 3501 }
} as const;
