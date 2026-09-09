export interface CityRegionCoord {
  readonly x: number;
  readonly z: number;
}

export interface RoadPoint {
  readonly x: number;
  readonly z: number;
}

export type RoadType = 'arterial' | 'collector' | 'local';

export interface RoadNode extends RoadPoint {
  readonly id: string;
}

export interface RoadSegment {
  readonly id: string;
  readonly startNodeId: string;
  readonly endNodeId: string;
  readonly type: RoadType;
  readonly width: number;
}

export interface CityBounds {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

export interface CityBlock {
  readonly id: string;
  readonly region: CityRegionCoord;
  readonly bounds: CityBounds;
  readonly area: number;
}

export interface Parcel {
  readonly id: string;
  readonly blockId: string;
  readonly center: RoadPoint;
  readonly width: number;
  readonly depth: number;
  readonly facingRoadId: string;
}

export interface CityRegionLayout {
  readonly coord: CityRegionCoord;
  readonly key: string;
  readonly isUrban: boolean;
  readonly nodes: readonly RoadNode[];
  readonly segments: readonly RoadSegment[];
  readonly blocks: readonly CityBlock[];
  readonly parcels: readonly Parcel[];
}

export interface ResolvedRoadSegment extends RoadSegment {
  readonly start: RoadPoint;
  readonly end: RoadPoint;
}

export function cityRegionKey(coord: CityRegionCoord): string {
  return `${coord.x}:${coord.z}`;
}

export function worldPositionToCityRegion(position: RoadPoint, regionSize: number): CityRegionCoord {
  return { x: Math.floor(position.x / regionSize), z: Math.floor(position.z / regionSize) };
}

export function cityRegionOrigin(coord: CityRegionCoord, regionSize: number): RoadPoint {
  return { x: coord.x * regionSize, z: coord.z * regionSize };
}

export function roadNodeId(point: RoadPoint): string {
  return `node:${Math.round(point.x * 1000)}:${Math.round(point.z * 1000)}`;
}

export function resolveRoadSegment(segment: RoadSegment, nodes: ReadonlyMap<string, RoadNode>): ResolvedRoadSegment {
  const start = nodes.get(segment.startNodeId);
  const end = nodes.get(segment.endNodeId);
  if (start === undefined || end === undefined) throw new Error(`Road segment ${segment.id} references an unknown node.`);
  return { ...segment, start, end };
}
