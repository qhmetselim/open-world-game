import { describe, expect, it } from 'vitest';
import { calculateBuildingHeight, calculateWindowGrid, getBuildingFootprintCorners, getBuildingFrontDirection } from './BuildingGeometry';
import type { BuildingData } from './BuildingTypes';

const building: BuildingData = {
  id: 'building:test', region: { x: 0, z: 0 }, parcelId: 'parcel:test', facingRoadId: 'road:test', seed: 1,
  type: 'residential', style: { facadePaletteIndex: 0, roof: 'flat' }, x: 10, z: 20, rotation: Math.PI / 2,
  width: 8, depth: 12, height: 15, floors: 5, baseElevation: 2, foundationHeight: 0.5,
  entranceSide: 'front', entrance: { x: 16, y: 3, z: 20, directionX: -1, directionZ: 0 }
};

describe('building geometry helpers', () => {
  it('derives total height and bounded window rows/columns from floors', () => {
    expect(calculateBuildingHeight(5, 3)).toBe(15);
    expect(calculateWindowGrid(18, 5, 4.5, 1.4)).toEqual({ columns: 4, rows: 5, horizontalSpacing: 4.5 });
  });

  it('returns rotated footprint corners and the matching front direction', () => {
    const corners = getBuildingFootprintCorners(building);
    const front = getBuildingFrontDirection(building.rotation);

    expect(corners).toContainEqual({ x: 16, z: 16 });
    expect(front).toEqual({ x: -1, z: expect.closeTo(0) });
  });
});
