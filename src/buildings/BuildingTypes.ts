import type { CityRegionCoord, RoadPoint } from '../city/CityTypes';

export type BuildingType = 'residential' | 'commercial' | 'mixedUse';
export type BuildingRoofType = 'flat' | 'parapet' | 'utility';

export interface BuildingStyle {
  readonly facadePaletteIndex: number;
  readonly roof: BuildingRoofType;
}

export interface BuildingEntrance extends RoadPoint {
  readonly y: number;
  readonly directionX: number;
  readonly directionZ: number;
}

export interface BuildingData {
  readonly id: string;
  readonly region: CityRegionCoord;
  readonly parcelId: string;
  readonly facingRoadId: string;
  readonly seed: number;
  readonly type: BuildingType;
  readonly style: BuildingStyle;
  readonly x: number;
  readonly z: number;
  readonly rotation: number;
  readonly width: number;
  readonly depth: number;
  readonly height: number;
  readonly floors: number;
  readonly baseElevation: number;
  readonly foundationHeight: number;
  readonly entranceSide: 'front';
  readonly entrance: BuildingEntrance;
}

export interface BuildingRegionLayout {
  readonly region: CityRegionCoord;
  readonly buildings: readonly BuildingData[];
}

export type BuildingFootprintCorner = RoadPoint;
