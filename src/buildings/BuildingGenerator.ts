import type { GameConfig } from '../core/Config';
import { hashStringToSeed } from '../world/SeededNoise';
import { resolveRoadSegment } from '../city/CityTypes';
import type { CityRegionLayout, Parcel, RoadPoint } from '../city/CityTypes';
import { calculateBuildingHeight, getBuildingFrontDirection, isPointWithinBuildingSafetyRadius } from './BuildingGeometry';
import type { BuildingData, BuildingRegionLayout, BuildingType } from './BuildingTypes';

export type TerrainHeightQuery = (worldX: number, worldZ: number) => number;

export class BuildingGenerator {
  public constructor(
    private readonly worldSeed: string,
    private readonly config: GameConfig['building'],
    private readonly terrainHeight: TerrainHeightQuery,
    private readonly spawnPosition: { readonly x: number; readonly z: number }
  ) {}

  public generateRegion(layout: CityRegionLayout): BuildingRegionLayout {
    if (!layout.isUrban) return { region: layout.coord, buildings: [] };
    const nodes = new Map(layout.nodes.map((node) => [node.id, node]));
    const buildings: BuildingData[] = [];
    for (const parcel of layout.parcels) {
      const building = this.generateBuilding(layout, parcel, nodes);
      if (building !== undefined) buildings.push(building);
    }
    return { region: layout.coord, buildings: buildings.sort((left, right) => left.id.localeCompare(right.id)) };
  }

  private generateBuilding(
    layout: CityRegionLayout,
    parcel: Parcel,
    nodes: ReadonlyMap<string, { readonly x: number; readonly z: number; readonly id: string }>
  ): BuildingData | undefined {
    const seedKey = `${this.worldSeed}:building:${layout.coord.x}:${layout.coord.z}:${parcel.id}`;
    const seed = hashStringToSeed(seedKey);
    if (randomUnit(seed, 'occupancy') > this.config.urbanOccupancy) return undefined;
    const road = layout.segments.find((segment) => segment.id === parcel.facingRoadId);
    if (road === undefined) return undefined;
    const resolvedRoad = resolveRoadSegment(road, nodes);
    const nearestRoadPoint = closestPointOnSegment(parcel.center, resolvedRoad.start, resolvedRoad.end);
    const forward = normalize({ x: nearestRoadPoint.x - parcel.center.x, z: nearestRoadPoint.z - parcel.center.z });
    if (forward === undefined) return undefined;
    const rotation = Math.atan2(-forward.x, -forward.z);
    const horizontalRoad = Math.abs(forward.z) > Math.abs(forward.x);
    const parcelAcross = horizontalRoad ? parcel.width : parcel.depth;
    const parcelAlong = horizontalRoad ? parcel.depth : parcel.width;
    const availableWidth = parcelAcross - this.config.setbacks.side * 2;
    const availableDepth = parcelAlong - this.config.setbacks.front - this.config.setbacks.rear;
    if (availableWidth < 8 || availableDepth < 8) return undefined;
    const type = selectBuildingType(seed);
    const widthTendency = type === 'commercial' ? 0.9 : type === 'mixedUse' ? 0.84 : 0.76;
    const depthTendency = type === 'commercial' ? 0.72 : type === 'mixedUse' ? 0.78 : 0.7;
    const width = availableWidth * (widthTendency + randomUnit(seed, 'width') * 0.1);
    const depth = availableDepth * (depthTendency + randomUnit(seed, 'depth') * 0.1);
    const frontBoundary = projectParcelBoundary(parcel, forward, true);
    const lateral = { x: -forward.z, z: forward.x };
    const lateralCenter = (projectParcelBoundary(parcel, lateral, true) + projectParcelBoundary(parcel, lateral, false)) / 2;
    const frontCenter = frontBoundary - this.config.setbacks.front - depth / 2;
    const x = forward.x * frontCenter + lateral.x * lateralCenter;
    const z = forward.z * frontCenter + lateral.z * lateralCenter;
    const floors = selectFloors(type, seed, this.config);
    const height = calculateBuildingHeight(floors, this.config.floorHeight);
    const base = calculateFoundationElevation({ x, z }, width, depth, rotation, this.terrainHeight);
    const building: BuildingData = {
      id: `building:${layout.coord.x}:${layout.coord.z}:${parcel.id}`,
      region: layout.coord,
      parcelId: parcel.id,
      facingRoadId: parcel.facingRoadId,
      seed,
      type,
      style: {
        facadePaletteIndex: Math.floor(randomUnit(seed, 'facade') * 4),
        roof: selectRoof(seed)
      },
      x,
      z,
      rotation,
      width,
      depth,
      height,
      floors,
      baseElevation: base.maximum + this.config.foundation.heightPadding,
      foundationHeight: Math.max(base.maximum - base.minimum + this.config.foundation.heightPadding, this.config.foundation.minimumHeight),
      entranceSide: 'front',
      entrance: {
        x: x + forward.x * (depth / 2 + 0.04),
        y: base.maximum + this.config.foundation.heightPadding + this.config.floorHeight * 0.42,
        z: z + forward.z * (depth / 2 + 0.04),
        directionX: forward.x,
        directionZ: forward.z
      }
    };
    if (isPointWithinBuildingSafetyRadius(building, this.spawnPosition, this.config.spawnSafetyRadius)) return undefined;
    return building;
  }
}

export function calculateFoundationElevation(
  center: RoadPoint,
  width: number,
  depth: number,
  rotation: number,
  getTerrainHeight: TerrainHeightQuery
): { readonly minimum: number; readonly maximum: number } {
  const forward = getBuildingFrontDirection(rotation);
  const lateral = { x: -forward.z, z: forward.x };
  const samples: number[] = [];
  for (const [along, across] of [[0, 0], [-depth / 2, -width / 2], [-depth / 2, width / 2], [depth / 2, -width / 2], [depth / 2, width / 2]] as const) {
    samples.push(getTerrainHeight(center.x + forward.x * along + lateral.x * across, center.z + forward.z * along + lateral.z * across));
  }
  return { minimum: Math.min(...samples), maximum: Math.max(...samples) };
}

function selectBuildingType(seed: number): BuildingType {
  const value = randomUnit(seed, 'type');
  if (value < 0.55) return 'residential';
  if (value < 0.77) return 'commercial';
  return 'mixedUse';
}

function selectFloors(type: BuildingType, seed: number, config: GameConfig['building']): number {
  const range = config[type];
  return range.minFloors + Math.floor(randomUnit(seed, 'floors') * (range.maxFloors - range.minFloors + 1));
}

function selectRoof(seed: number): BuildingData['style']['roof'] {
  const value = randomUnit(seed, 'roof');
  return value < 0.45 ? 'flat' : value < 0.78 ? 'parapet' : 'utility';
}

function randomUnit(seed: number, key: string): number {
  return hashStringToSeed(`${seed}:${key}`) / 0xffff_ffff;
}

function closestPointOnSegment(point: RoadPoint, start: RoadPoint, end: RoadPoint): RoadPoint {
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const lengthSquared = dx * dx + dz * dz;
  const amount = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.z - start.z) * dz) / lengthSquared));
  return { x: start.x + dx * amount, z: start.z + dz * amount };
}

function normalize(vector: RoadPoint): RoadPoint | undefined {
  const length = Math.hypot(vector.x, vector.z);
  if (length < 0.0001) return undefined;
  return { x: vector.x / length, z: vector.z / length };
}

function projectParcelBoundary(parcel: Parcel, direction: RoadPoint, maximum: boolean): number {
  const corners: readonly RoadPoint[] = [
    { x: parcel.center.x - parcel.width / 2, z: parcel.center.z - parcel.depth / 2 },
    { x: parcel.center.x + parcel.width / 2, z: parcel.center.z - parcel.depth / 2 },
    { x: parcel.center.x + parcel.width / 2, z: parcel.center.z + parcel.depth / 2 },
    { x: parcel.center.x - parcel.width / 2, z: parcel.center.z + parcel.depth / 2 }
  ];
  const values = corners.map((corner) => corner.x * direction.x + corner.z * direction.z);
  return maximum ? Math.max(...values) : Math.min(...values);
}
