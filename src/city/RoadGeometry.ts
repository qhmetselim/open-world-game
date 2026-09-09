import type { CityBounds, ResolvedRoadSegment, RoadPoint } from './CityTypes';

export interface ClippedRoadSegment extends ResolvedRoadSegment {
  readonly start: RoadPoint;
  readonly end: RoadPoint;
}

export interface RoadSurfaceData {
  readonly positions: Float32Array;
  readonly indices: Uint32Array;
  readonly centerLines: Float32Array;
  readonly nodePoints: Float32Array;
  readonly visibleSegmentCount: number;
  readonly visibleIntersectionCount: number;
}

/**
 * A junction owns the pavement inside its square footprint.  Approach segments
 * stop at the footprint edge, which prevents their coplanar ribbons from
 * overlapping one another at T and four-way intersections.
 */
export interface RoadIntersectionSurface {
  readonly id: string;
  readonly position: RoadPoint;
  readonly halfExtent: number;
}

export type TerrainHeightQuery = (worldX: number, worldZ: number) => number;

export function clipRoadSegmentToBounds(segment: ResolvedRoadSegment, bounds: CityBounds): ClippedRoadSegment | undefined {
  const dx = segment.end.x - segment.start.x;
  const dz = segment.end.z - segment.start.z;
  let minimum = 0;
  let maximum = 1;
  const edges: readonly [number, number][] = [
    [-dx, segment.start.x - bounds.minX],
    [dx, bounds.maxX - segment.start.x],
    [-dz, segment.start.z - bounds.minZ],
    [dz, bounds.maxZ - segment.start.z]
  ];

  for (const [p, q] of edges) {
    if (p === 0) {
      if (q < 0) return undefined;
      continue;
    }
    const ratio = q / p;
    if (p < 0) {
      if (ratio > maximum) return undefined;
      minimum = Math.max(minimum, ratio);
    } else {
      if (ratio < minimum) return undefined;
      maximum = Math.min(maximum, ratio);
    }
  }
  if (minimum > maximum) return undefined;
  return {
    ...segment,
    start: interpolatePoint(segment.start, segment.end, minimum),
    end: interpolatePoint(segment.start, segment.end, maximum)
  };
}

export function sampleRoadSegment(start: RoadPoint, end: RoadPoint, sampleSpacing: number): RoadPoint[] {
  const length = Math.hypot(end.x - start.x, end.z - start.z);
  const steps = Math.max(1, Math.ceil(length / sampleSpacing));
  const samples: RoadPoint[] = [];
  for (let index = 0; index <= steps; index += 1) samples.push(interpolatePoint(start, end, index / steps));
  return samples;
}

export function prepareRoadSurfaces(roads: readonly ResolvedRoadSegment[]): {
  readonly segments: readonly ResolvedRoadSegment[];
  readonly intersections: readonly RoadIntersectionSurface[];
} {
  const uniqueRoads = new Map<string, ResolvedRoadSegment>();
  for (const road of roads) uniqueRoads.set(road.id, road);
  const unique = [...uniqueRoads.values()].sort((left, right) => left.id.localeCompare(right.id));
  const roadsAtNode = new Map<string, ResolvedRoadSegment[]>();
  for (const road of unique) {
    addRoadAtNode(roadsAtNode, road.startNodeId, road);
    addRoadAtNode(roadsAtNode, road.endNodeId, road);
  }
  const intersections = new Map<string, RoadIntersectionSurface>();
  for (const [nodeId, nodeRoads] of roadsAtNode) {
    if (nodeRoads.length < 3) continue;
    const road = nodeRoads[0];
    if (road === undefined) continue;
    const point = road.startNodeId === nodeId ? road.start : road.end;
    intersections.set(nodeId, {
      id: `intersection-surface:${nodeId}`,
      position: { x: point.x, z: point.z },
      halfExtent: Math.max(...nodeRoads.map((candidate) => candidate.width)) / 2
    });
  }
  const segments = unique.flatMap((road) => {
    const startIntersection = intersections.get(road.startNodeId);
    const endIntersection = intersections.get(road.endNodeId);
    const length = Math.hypot(road.end.x - road.start.x, road.end.z - road.start.z);
    if (length <= 0.001) return [];
    const startTrim = startIntersection?.halfExtent ?? 0;
    const endTrim = endIntersection?.halfExtent ?? 0;
    if (startTrim + endTrim >= length - 0.001) return [];
    const directionX = (road.end.x - road.start.x) / length;
    const directionZ = (road.end.z - road.start.z) / length;
    return [{
      ...road,
      start: { x: road.start.x + directionX * startTrim, z: road.start.z + directionZ * startTrim },
      end: { x: road.end.x - directionX * endTrim, z: road.end.z - directionZ * endTrim }
    }];
  });
  return { segments, intersections: [...intersections.values()].sort((left, right) => left.id.localeCompare(right.id)) };
}

export function intersectionOwnedByChunk(
  intersection: RoadIntersectionSurface,
  chunkOrigin: RoadPoint,
  chunkSize: number
): boolean {
  return Math.floor(intersection.position.x / chunkSize) * chunkSize === chunkOrigin.x
    && Math.floor(intersection.position.z / chunkSize) * chunkSize === chunkOrigin.z;
}

/**
 * A road whose centerline lies exactly on a chunk edge must be emitted by only
 * one side.  The clipped span midpoint gives both sides the same stable owner
 * without affecting normal cross-chunk continuity.
 */
export function clippedRoadOwnedByChunk(
  segment: Pick<ResolvedRoadSegment, 'start' | 'end'>,
  chunkOrigin: RoadPoint,
  chunkSize: number
): boolean {
  const epsilon = 0.0001;
  const isEdge = (value: number, edge: number) => Math.abs(value - edge) <= epsilon;
  const liesOnXEdge = Math.abs(segment.start.x - segment.end.x) <= epsilon
    && (isEdge(segment.start.x, chunkOrigin.x) || isEdge(segment.start.x, chunkOrigin.x + chunkSize));
  const liesOnZEdge = Math.abs(segment.start.z - segment.end.z) <= epsilon
    && (isEdge(segment.start.z, chunkOrigin.z) || isEdge(segment.start.z, chunkOrigin.z + chunkSize));
  if (!liesOnXEdge && !liesOnZEdge) return true;
  const midpoint = { x: (segment.start.x + segment.end.x) / 2, z: (segment.start.z + segment.end.z) / 2 };
  return Math.floor(midpoint.x / chunkSize) * chunkSize === chunkOrigin.x
    && Math.floor(midpoint.z / chunkSize) * chunkSize === chunkOrigin.z;
}

export function buildRoadSurface(
  segments: readonly ResolvedRoadSegment[],
  terrainHeight: TerrainHeightQuery,
  surfaceOffset: number,
  sampleSpacing: number,
  intersections: readonly RoadIntersectionSurface[] = []
): RoadSurfaceData {
  const positions: number[] = [];
  const indices: number[] = [];
  const centerLines: number[] = [];
  const nodePoints: number[] = [];
  const seenNodes = new Set<string>();
  let visibleSegmentCount = 0;

  for (const segment of segments) {
    const samples = sampleRoadSegment(segment.start, segment.end, sampleSpacing);
    if (samples.length < 2) continue;
    const baseIndex = positions.length / 3;
    const directionX = (segment.end.x - segment.start.x) / Math.max(Math.hypot(segment.end.x - segment.start.x, segment.end.z - segment.start.z), Number.EPSILON);
    const directionZ = (segment.end.z - segment.start.z) / Math.max(Math.hypot(segment.end.x - segment.start.x, segment.end.z - segment.start.z), Number.EPSILON);
    const perpendicularX = -directionZ * segment.width / 2;
    const perpendicularZ = directionX * segment.width / 2;

    for (const point of samples) {
      const leftX = point.x + perpendicularX;
      const leftZ = point.z + perpendicularZ;
      const rightX = point.x - perpendicularX;
      const rightZ = point.z - perpendicularZ;
      positions.push(leftX, terrainHeight(leftX, leftZ) + surfaceOffset, leftZ);
      positions.push(rightX, terrainHeight(rightX, rightZ) + surfaceOffset, rightZ);
    }
    for (let index = 0; index < samples.length - 1; index += 1) {
      const first = baseIndex + index * 2;
      indices.push(first, first + 2, first + 1, first + 1, first + 2, first + 3);
      const start = samples[index];
      const end = samples[index + 1];
      if (start !== undefined && end !== undefined) {
        centerLines.push(
          start.x, terrainHeight(start.x, start.z) + surfaceOffset * 2, start.z,
          end.x, terrainHeight(end.x, end.z) + surfaceOffset * 2, end.z
        );
      }
    }
    addNodePoint(nodePoints, seenNodes, segment.startNodeId, segment.start, terrainHeight, surfaceOffset);
    addNodePoint(nodePoints, seenNodes, segment.endNodeId, segment.end, terrainHeight, surfaceOffset);
    visibleSegmentCount += 1;
  }

  for (const intersection of intersections) {
    appendIntersectionSurface(positions, indices, intersection, terrainHeight, surfaceOffset);
  }

  return {
    positions: new Float32Array(positions),
    indices: new Uint32Array(indices),
    centerLines: new Float32Array(centerLines),
    nodePoints: new Float32Array(nodePoints),
    visibleSegmentCount,
    visibleIntersectionCount: intersections.length
  };
}

function appendIntersectionSurface(
  positions: number[],
  indices: number[],
  intersection: RoadIntersectionSurface,
  terrainHeight: TerrainHeightQuery,
  surfaceOffset: number
): void {
  const base = positions.length / 3;
  const { x, z } = intersection.position;
  const extent = intersection.halfExtent;
  const corners = [
    { x: x - extent, z: z - extent }, { x: x + extent, z: z - extent },
    { x: x + extent, z: z + extent }, { x: x - extent, z: z + extent }
  ];
  for (const corner of corners) positions.push(corner.x, terrainHeight(corner.x, corner.z) + surfaceOffset, corner.z);
  indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
}

function interpolatePoint(start: RoadPoint, end: RoadPoint, amount: number): RoadPoint {
  return { x: start.x + (end.x - start.x) * amount, z: start.z + (end.z - start.z) * amount };
}

function addNodePoint(
  points: number[],
  seenNodes: Set<string>,
  id: string,
  point: RoadPoint,
  terrainHeight: TerrainHeightQuery,
  surfaceOffset: number
): void {
  if (seenNodes.has(id)) return;
  seenNodes.add(id);
  points.push(point.x, terrainHeight(point.x, point.z) + surfaceOffset * 3, point.z);
}

function addRoadAtNode(map: Map<string, ResolvedRoadSegment[]>, nodeId: string, road: ResolvedRoadSegment): void {
  const roads = map.get(nodeId) ?? [];
  roads.push(road);
  map.set(nodeId, roads);
}
