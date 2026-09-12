/** Rapier memberships (upper 16 bits) and interaction filter (lower 16 bits). */
export const CollisionLayer = { terrain: 1, building: 2, player: 4, vehicle: 8, traffic: 16, query: 32 } as const;
export const collisionGroups = (membership: number, mask = 0xffff): number => ((membership << 16) | mask) >>> 0;
export const QueryGroups = {
  camera: collisionGroups(CollisionLayer.query, CollisionLayer.terrain | CollisionLayer.building | CollisionLayer.vehicle | CollisionLayer.traffic),
  ground: collisionGroups(CollisionLayer.query, CollisionLayer.terrain | CollisionLayer.building),
  obstacles: collisionGroups(CollisionLayer.query, CollisionLayer.building | CollisionLayer.player | CollisionLayer.vehicle | CollisionLayer.traffic)
} as const;
