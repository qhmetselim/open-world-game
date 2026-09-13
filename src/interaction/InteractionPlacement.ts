import type { BuildingData } from '../buildings/BuildingTypes';
import type { Interactable, InteractionConfig } from './InteractionState';

/** Small exterior vestibule; the existing private building volume stays intact. */
export function createEntranceDoor(building: BuildingData, ownerChunk: string, config: InteractionConfig,
  height: (x: number, z: number) => number, clear: (x: number, z: number) => boolean): Interactable | undefined {
  const normal = { x: building.entrance.directionX, z: building.entrance.directionZ };
  const x = building.entrance.x + normal.x * config.vestibuleDepth;
  const z = building.entrance.z + normal.z * config.vestibuleDepth;
  const heights: number[] = [];
  for (const across of [-config.doorWidth / 2 - 2 * config.frameThickness, 0, config.doorWidth / 2 + 2 * config.frameThickness]) {
    for (const along of [-config.vestibuleDepth, 0, config.frameThickness * 2]) {
      const px = x + normal.z * across + normal.x * along;
      const pz = z - normal.x * across + normal.z * along;
      if (!clear(px, pz)) return undefined;
      heights.push(height(px, pz));
    }
  }
  if (!heights.every(Number.isFinite) || Math.max(...heights) - Math.min(...heights) > config.maximumGroundVariation) return undefined;
  const y = Math.max(...heights) + config.foundationPadding;
  return { id: `${building.id}:door`, type: 'door', ownerChunk, position: { x, y, z },
    anchor: { x, y: y + config.doorHeight / 2, z }, yaw: Math.atan2(normal.x, normal.z),
    radius: config.range, enabled: true, actionLabel: 'Door' };
}
