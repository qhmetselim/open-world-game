import { clippedRoadOwnedByChunk, clipRoadSegmentToBounds, prepareRoadSurfaces, sampleRoadSegment } from './RoadGeometry';
import type { TerrainHeightQuery } from './RoadGeometry';
import type { CityBounds, CityRegionLayout, ResolvedRoadSegment, RoadPoint } from './CityTypes';
import { resolveRoadSegment } from './CityTypes';
import type { GameConfig } from '../core/Config';
import type { UrbanMobilityNetwork } from './UrbanMobility';

export interface StreetMeshData {
  readonly sidewalk: MeshData;
  readonly curb: MeshData;
  readonly marking: MeshData;
  readonly debugLines: Float32Array;
  readonly intersectionPoints: Float32Array;
  readonly visibleSidewalkSegmentCount: number;
  readonly visibleLaneCount: number;
  readonly visiblePedestrianNodeCount: number;
  readonly visibleCrossingCount: number;
  readonly visibleIntersectionCount: number;
}

export interface MeshData {
  readonly positions: Float32Array;
  readonly indices: Uint32Array;
}

export function buildStreetMeshData(
  layouts: readonly CityRegionLayout[],
  network: UrbanMobilityNetwork,
  bounds: CityBounds,
  terrainHeight: TerrainHeightQuery,
  config: GameConfig['city']['mobility'],
  sampleSpacing: number
): StreetMeshData {
  const sidewalk: number[] = [];
  const sidewalkIndices: number[] = [];
  const curb: number[] = [];
  const curbIndices: number[] = [];
  const marking: number[] = [];
  const markingIndices: number[] = [];
  const allRoads = resolveRoads(layouts);
  // Detail layers share the road surface's junction boundary.  Keeping these
  // layers out of the owned intersection surface avoids coplanar markings,
  // curbs, and sidewalks in the middle of a junction.
  const preparedRoads = prepareRoadSurfaces(allRoads);
  const chunkOrigin = { x: bounds.minX, z: bounds.minZ };
  const chunkSize = bounds.maxX - bounds.minX;
  const clippedRoads = preparedRoads.segments.flatMap((road) => {
    const clipped = clipRoadSegmentToBounds(road, bounds);
    return clipped === undefined || length(clipped.start, clipped.end) < 0.001 || !clippedRoadOwnedByChunk(clipped, chunkOrigin, chunkSize) ? [] : [clipped];
  });

  for (const road of clippedRoads) {
    const samples = sampleRoadSegment(road.start, road.end, sampleSpacing);
    const direction = normalized(road.start, road.end);
    const normal = { x: -direction.z, z: direction.x };
    for (const sign of [-1, 1]) {
      appendRibbon(sidewalk, sidewalkIndices, samples, normal, sign * (road.width / 2 + config.curbWidth + config.sidewalkWidth / 2), config.sidewalkWidth, terrainHeight, config.surfaceOffset);
      appendRibbon(curb, curbIndices, samples, normal, sign * (road.width / 2 + config.curbWidth / 2), config.curbWidth, terrainHeight, config.surfaceOffset + config.curbHeight);
    }
    appendDashes(marking, markingIndices, road.start, road.end, 0, config.markingWidth, terrainHeight, config.surfaceOffset * 2, 5.5, 3.5);
    const laneCount = config[road.type].lanesPerDirection;
    for (let index = 1; index < laneCount; index += 1) {
      const offset = index * config.laneWidth;
      appendDashes(marking, markingIndices, road.start, road.end, offset, config.markingWidth, terrainHeight, config.surfaceOffset * 2, 4, 4);
      appendDashes(marking, markingIndices, road.start, road.end, -offset, config.markingWidth, terrainHeight, config.surfaceOffset * 2, 4, 4);
    }
  }

  const roadById = new Map(allRoads.map((road) => [road.id, road]));
  let visibleCrossingCount = 0;
  for (const crossing of network.crossings) {
    const road = roadById.get(crossing.roadId);
    const crossingCenter = { x: (crossing.start.x + crossing.end.x) / 2, z: (crossing.start.z + crossing.end.z) / 2 };
    if (road === undefined || !ownsPoint(bounds, crossingCenter)) continue;
    const direction = normalized(road.start, road.end);
    const stripeCount = Math.max(2, Math.floor(config.crosswalkWidth / (config.crosswalkStripeWidth + config.crosswalkStripeGap)));
    for (let stripe = 0; stripe < stripeCount; stripe += 1) {
      const centered = stripe - (stripeCount - 1) / 2;
      const start = offsetPoint(crossing.start, direction, centered * (config.crosswalkStripeWidth + config.crosswalkStripeGap));
      const end = offsetPoint(crossing.end, direction, centered * (config.crosswalkStripeWidth + config.crosswalkStripeGap));
      // A stripe spans the carriageway, while its narrow width runs along it.
      appendRibbon(marking, markingIndices, [start, end], direction, 0, config.crosswalkStripeWidth, terrainHeight, config.surfaceOffset * 2.2);
    }
    visibleCrossingCount += 1;
  }

  const debugLines: number[] = [];
  for (const lane of network.lanes) {
    if (lane.path.some((point) => contains(bounds, point))) appendLine(debugLines, lane.path, terrainHeight, config.surfaceOffset * 4);
  }
  for (const connection of network.pedestrianConnections) {
    const from = network.pedestrianNodes.find((node) => node.id === connection.fromNodeId);
    const to = network.pedestrianNodes.find((node) => node.id === connection.toNodeId);
    if (from !== undefined && to !== undefined && (contains(bounds, from.position) || contains(bounds, to.position))) {
      appendLine(debugLines, [from.position, to.position], terrainHeight, config.surfaceOffset * 4);
    }
  }
  for (const crossing of network.crossings) {
    if (contains(bounds, crossing.start) || contains(bounds, crossing.end)) appendLine(debugLines, [crossing.start, crossing.end], terrainHeight, config.surfaceOffset * 5);
  }
  const visibleIntersections = network.intersections.filter((intersection) => ownsPoint(bounds, intersection.position));
  const intersectionPoints = visibleIntersections.flatMap((intersection) => [
    intersection.position.x,
    terrainHeight(intersection.position.x, intersection.position.z) + config.surfaceOffset * 6,
    intersection.position.z
  ]);

  return {
    sidewalk: asMeshData(sidewalk, sidewalkIndices),
    curb: asMeshData(curb, curbIndices),
    marking: asMeshData(marking, markingIndices),
    debugLines: new Float32Array(debugLines),
    intersectionPoints: new Float32Array(intersectionPoints),
    visibleSidewalkSegmentCount: clippedRoads.length * 2,
    visibleLaneCount: network.lanes.filter((lane) => lane.path.some((point) => contains(bounds, point))).length,
    visiblePedestrianNodeCount: network.pedestrianNodes.filter((node) => contains(bounds, node.position)).length,
    visibleCrossingCount,
    visibleIntersectionCount: visibleIntersections.length
  };
}

function resolveRoads(layouts: readonly CityRegionLayout[]): ResolvedRoadSegment[] {
  const roads = new Map<string, ResolvedRoadSegment>();
  for (const layout of layouts) {
    const nodes = new Map(layout.nodes.map((node) => [node.id, node]));
    for (const road of layout.segments) roads.set(road.id, resolveRoadSegment(road, nodes));
  }
  return [...roads.values()];
}

function appendDashes(
  positions: number[], indices: number[], start: RoadPoint, end: RoadPoint, lateralOffset: number, width: number,
  terrainHeight: TerrainHeightQuery, elevation: number, dashLength: number, gapLength: number
): void {
  const direction = normalized(start, end);
  const normal = { x: -direction.z, z: direction.x };
  const totalLength = length(start, end);
  for (let distance = 0; distance < totalLength; distance += dashLength + gapLength) {
    const dashEnd = Math.min(totalLength, distance + dashLength);
    const a = offsetPoint(offsetPoint(start, direction, distance), normal, lateralOffset);
    const b = offsetPoint(offsetPoint(start, direction, dashEnd), normal, lateralOffset);
    appendRibbon(positions, indices, [a, b], normal, 0, width, terrainHeight, elevation);
  }
}

function appendRibbon(
  positions: number[], indices: number[], points: readonly RoadPoint[], normal: RoadPoint, offset: number, width: number,
  terrainHeight: TerrainHeightQuery, elevation: number
): void {
  if (points.length < 2) return;
  const base = positions.length / 3;
  for (const point of points) {
    const center = offsetPoint(point, normal, offset);
    const left = offsetPoint(center, normal, width / 2);
    const right = offsetPoint(center, normal, -width / 2);
    positions.push(left.x, terrainHeight(left.x, left.z) + elevation, left.z, right.x, terrainHeight(right.x, right.z) + elevation, right.z);
  }
  for (let index = 0; index < points.length - 1; index += 1) {
    const first = base + index * 2;
    indices.push(first, first + 2, first + 1, first + 1, first + 2, first + 3);
  }
}

function appendLine(target: number[], points: readonly RoadPoint[], height: TerrainHeightQuery, elevation: number): void {
  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index];
    const end = points[index + 1];
    if (start === undefined || end === undefined) continue;
    target.push(start.x, height(start.x, start.z) + elevation, start.z, end.x, height(end.x, end.z) + elevation, end.z);
  }
}

function asMeshData(positions: number[], indices: number[]): MeshData {
  return { positions: new Float32Array(positions), indices: new Uint32Array(indices) };
}

function normalized(start: RoadPoint, end: RoadPoint): RoadPoint {
  const distance = length(start, end);
  return distance === 0 ? { x: 0, z: 0 } : { x: (end.x - start.x) / distance, z: (end.z - start.z) / distance };
}

function length(start: RoadPoint, end: RoadPoint): number {
  return Math.hypot(end.x - start.x, end.z - start.z);
}

function offsetPoint(point: RoadPoint, direction: RoadPoint, distance: number): RoadPoint {
  return { x: point.x + direction.x * distance, z: point.z + direction.z * distance };
}

function contains(bounds: CityBounds, point: RoadPoint): boolean {
  return point.x >= bounds.minX && point.x <= bounds.maxX && point.z >= bounds.minZ && point.z <= bounds.maxZ;
}

function ownsPoint(bounds: CityBounds, point: RoadPoint): boolean {
  const chunkSize = bounds.maxX - bounds.minX;
  return Math.floor(point.x / chunkSize) * chunkSize === bounds.minX
    && Math.floor(point.z / chunkSize) * chunkSize === bounds.minZ;
}
