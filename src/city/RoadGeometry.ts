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

export function buildRoadSurface(
  segments: readonly ResolvedRoadSegment[],
  terrainHeight: TerrainHeightQuery,
  surfaceOffset: number,
  sampleSpacing: number
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

  return {
    positions: new Float32Array(positions),
    indices: new Uint32Array(indices),
    centerLines: new Float32Array(centerLines),
    nodePoints: new Float32Array(nodePoints),
    visibleSegmentCount
  };
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
