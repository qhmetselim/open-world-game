import type { BuildingData, BuildingFootprintCorner } from './BuildingTypes';

export interface WindowGrid {
  readonly columns: number;
  readonly rows: number;
  readonly horizontalSpacing: number;
}

export function calculateBuildingHeight(floors: number, floorHeight: number): number {
  return floors * floorHeight;
}

export function calculateWindowGrid(width: number, floors: number, targetSpacing: number, minimumWidth: number): WindowGrid {
  const columns = Math.max(1, Math.floor(width / targetSpacing));
  const horizontalSpacing = width / columns;
  return {
    columns: horizontalSpacing >= minimumWidth ? columns : 1,
    rows: floors,
    horizontalSpacing: width / Math.max(1, horizontalSpacing >= minimumWidth ? columns : 1)
  };
}

export function getBuildingFootprintCorners(building: BuildingData): readonly BuildingFootprintCorner[] {
  const halfWidth = building.width / 2;
  const halfDepth = building.depth / 2;
  const localCorners: readonly [number, number][] = [
    [-halfWidth, -halfDepth], [halfWidth, -halfDepth], [halfWidth, halfDepth], [-halfWidth, halfDepth]
  ];
  return localCorners.map(([localX, localZ]) => transformLocalPoint(building, localX, localZ));
}

export function getBuildingFrontDirection(rotation: number): { readonly x: number; readonly z: number } {
  return { x: -Math.sin(rotation), z: -Math.cos(rotation) };
}

export function transformLocalPoint(building: Pick<BuildingData, 'x' | 'z' | 'rotation'>, localX: number, localZ: number): BuildingFootprintCorner {
  const cosine = Math.cos(building.rotation);
  const sine = Math.sin(building.rotation);
  return {
    x: building.x + localX * cosine + localZ * sine,
    z: building.z - localX * sine + localZ * cosine
  };
}

export function isPointWithinBuildingSafetyRadius(
  building: Pick<BuildingData, 'x' | 'z' | 'rotation' | 'width' | 'depth'>,
  point: { readonly x: number; readonly z: number },
  radius: number
): boolean {
  const cosine = Math.cos(building.rotation);
  const sine = Math.sin(building.rotation);
  const deltaX = point.x - building.x;
  const deltaZ = point.z - building.z;
  const localX = deltaX * cosine - deltaZ * sine;
  const localZ = deltaX * sine + deltaZ * cosine;
  const outsideX = Math.max(Math.abs(localX) - building.width / 2, 0);
  const outsideZ = Math.max(Math.abs(localZ) - building.depth / 2, 0);
  return Math.hypot(outsideX, outsideZ) < radius;
}
