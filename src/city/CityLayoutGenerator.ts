import type { GameConfig } from '../core/Config';
import { hashStringToSeed } from '../world/SeededNoise';
import {
  cityRegionKey,
  cityRegionOrigin,
  roadNodeId
} from './CityTypes';
import type {
  CityBlock,
  CityBounds,
  CityRegionCoord,
  CityRegionLayout,
  Parcel,
  RoadNode,
  RoadPoint,
  RoadSegment,
  RoadType
} from './CityTypes';

type CityConfig = GameConfig['city'];

interface RoadLine {
  readonly axis: 'horizontal' | 'vertical';
  readonly coordinate: number;
  readonly minimum: number;
  readonly maximum: number;
  readonly type: RoadType;
  readonly width: number;
}

interface AxisBoundary {
  readonly coordinate: number;
  readonly width: number;
}

export type TerrainHeightQuery = (worldX: number, worldZ: number) => number;

export class CityLayoutGenerator {
  public constructor(
    private readonly seed: string,
    private readonly config: CityConfig,
    private readonly getTerrainHeight: TerrainHeightQuery
  ) {}

  public generateRegion(coord: CityRegionCoord): CityRegionLayout {
    const key = cityRegionKey(coord);
    const origin = cityRegionOrigin(coord, this.config.regionSize);
    const arterialHorizontal = this.getHorizontalArterial(coord.z);
    const arterialVertical = this.getVerticalArterial(coord.x);
    const lines: RoadLine[] = [
      {
        axis: 'horizontal', coordinate: arterialHorizontal, minimum: origin.x,
        maximum: origin.x + this.config.regionSize, type: 'arterial', width: this.config.road.arterialWidth
      },
      {
        axis: 'vertical', coordinate: arterialVertical, minimum: origin.z,
        maximum: origin.z + this.config.regionSize, type: 'arterial', width: this.config.road.arterialWidth
      }
    ];

    const isUrban = this.isUrban(coord);
    if (isUrban) lines.push(...this.createLocalLines(coord, origin, arterialHorizontal, arterialVertical));

    const nodes = new Map<string, RoadNode>();
    const segments: RoadSegment[] = [];
    this.createRoadSegments(lines, nodes, segments);
    for (const [id, node] of nodes) {
      if (node.x === origin.x || node.x === origin.x + this.config.regionSize || node.z === origin.z || node.z === origin.z + this.config.regionSize) {
        nodes.set(id, { ...node, terminalReason: 'regionBoundary' });
      } else if ((node.x === origin.x + this.config.road.regionMargin || node.x === origin.x + this.config.regionSize - this.config.road.regionMargin
        || node.z === origin.z + this.config.road.regionMargin || node.z === origin.z + this.config.regionSize - this.config.road.regionMargin)
        && segments.filter((segment) => segment.startNodeId === id || segment.endNodeId === id).length === 1) {
        // Local streets intentionally end at the urban region margin; through roads never do.
        nodes.set(id, { ...node, terminalReason: 'culDeSac' });
      }
    }
    const sortedNodes = [...nodes.values()].sort((left, right) => left.id.localeCompare(right.id));
    const sortedSegments = segments.sort((left, right) => left.id.localeCompare(right.id));
    const { blocks, parcels } = isUrban
      ? this.createBlocksAndParcels(coord, origin, lines, sortedNodes, sortedSegments)
      : { blocks: [], parcels: [] };

    return { coord, key, isUrban, nodes: sortedNodes, segments: sortedSegments, blocks, parcels };
  }

  private isUrban(coord: CityRegionCoord): boolean {
    if (Math.max(Math.abs(coord.x), Math.abs(coord.z)) <= this.config.urbanSpawnRadius) return true;
    return randomUnit(this.seed, `urban:${coord.x}:${coord.z}`) < this.config.urbanChance;
  }

  private getHorizontalArterial(regionZ: number): number {
    const offset = 0.34 + randomUnit(this.seed, `arterial-horizontal:${regionZ}`) * 0.32;
    return regionZ * this.config.regionSize + offset * this.config.regionSize;
  }

  private getVerticalArterial(regionX: number): number {
    const offset = 0.34 + randomUnit(this.seed, `arterial-vertical:${regionX}`) * 0.32;
    return regionX * this.config.regionSize + offset * this.config.regionSize;
  }

  private createLocalLines(
    coord: CityRegionCoord,
    origin: RoadPoint,
    arterialHorizontal: number,
    arterialVertical: number
  ): RoadLine[] {
    const margin = this.config.road.regionMargin;
    const localStartX = origin.x + margin;
    const localEndX = origin.x + this.config.regionSize - margin;
    const localStartZ = origin.z + margin;
    const localEndZ = origin.z + this.config.regionSize - margin;
    const horizontalOffset = randomUnit(this.seed, `local-horizontal:${coord.x}:${coord.z}`) * this.config.road.localRoadSpacing;
    const verticalOffset = randomUnit(this.seed, `local-vertical:${coord.x}:${coord.z}`) * this.config.road.localRoadSpacing;
    const lines: RoadLine[] = [];

    for (let coordinate = localStartZ + horizontalOffset; coordinate < localEndZ; coordinate += this.config.road.localRoadSpacing) {
      if (Math.abs(coordinate - arterialHorizontal) >= this.config.road.minBlockSize) {
        lines.push({ axis: 'horizontal', coordinate, minimum: localStartX, maximum: localEndX, type: 'local', width: this.config.road.localWidth });
      }
    }
    for (let coordinate = localStartX + verticalOffset; coordinate < localEndX; coordinate += this.config.road.localRoadSpacing) {
      if (Math.abs(coordinate - arterialVertical) >= this.config.road.minBlockSize) {
        lines.push({ axis: 'vertical', coordinate, minimum: localStartZ, maximum: localEndZ, type: 'local', width: this.config.road.localWidth });
      }
    }

    return lines;
  }

  private createRoadSegments(lines: readonly RoadLine[], nodes: Map<string, RoadNode>, segments: RoadSegment[]): void {
    for (const line of lines) {
      const intersections = [line.minimum, line.maximum];
      for (const candidate of lines) {
        if (candidate.axis === line.axis) continue;
        const crossing = candidate.coordinate;
        if (crossing > line.minimum && crossing < line.maximum && line.coordinate >= candidate.minimum && line.coordinate <= candidate.maximum) {
          intersections.push(crossing);
        }
      }
      intersections.sort((left, right) => left - right);
      for (let index = 0; index < intersections.length - 1; index += 1) {
        const first = intersections[index];
        const second = intersections[index + 1];
        if (first === undefined || second === undefined) continue;
        const start = line.axis === 'horizontal' ? { x: first, z: line.coordinate } : { x: line.coordinate, z: first };
        const end = line.axis === 'horizontal' ? { x: second, z: line.coordinate } : { x: line.coordinate, z: second };
        if (!isRoadGradeSafe(start, end, this.getTerrainHeight, this.config.road.maxRoadGrade, this.config.road.sampleSpacing)) {
          throw new Error(`Road generation grade failure: ${roadNodeId(start)}>${roadNodeId(end)}`);
        }
        const startNode = getOrCreateNode(nodes, start);
        const endNode = getOrCreateNode(nodes, end);
        const id = `road:${line.type}:${startNode.id}>${endNode.id}`;
        if (!segments.some((segment) => segment.id === id)) {
          segments.push({ id, startNodeId: startNode.id, endNodeId: endNode.id, type: line.type, width: line.width });
        }
      }
    }
  }

  private createBlocksAndParcels(
    coord: CityRegionCoord,
    origin: RoadPoint,
    lines: readonly RoadLine[],
    nodes: readonly RoadNode[],
    segments: readonly RoadSegment[]
  ): { readonly blocks: CityBlock[]; readonly parcels: Parcel[] } {
    const margin = this.config.road.regionMargin;
    const verticalBoundaries = getAxisBoundaries(lines, 'vertical', origin.x + margin, origin.x + this.config.regionSize - margin);
    const horizontalBoundaries = getAxisBoundaries(lines, 'horizontal', origin.z + margin, origin.z + this.config.regionSize - margin);
    const nodeMap = new Map(nodes.map((node) => [node.id, node]));
    const blocks: CityBlock[] = [];
    const parcels: Parcel[] = [];

    for (let xIndex = 0; xIndex < verticalBoundaries.length - 1; xIndex += 1) {
      for (let zIndex = 0; zIndex < horizontalBoundaries.length - 1; zIndex += 1) {
        const left = verticalBoundaries[xIndex];
        const right = verticalBoundaries[xIndex + 1];
        const top = horizontalBoundaries[zIndex];
        const bottom = horizontalBoundaries[zIndex + 1];
        if (left === undefined || right === undefined || top === undefined || bottom === undefined) continue;
        const bounds: CityBounds = {
          minX: left.coordinate + left.width / 2 + this.config.road.parcelInset,
          maxX: right.coordinate - right.width / 2 - this.config.road.parcelInset,
          minZ: top.coordinate + top.width / 2 + this.config.road.parcelInset,
          maxZ: bottom.coordinate - bottom.width / 2 - this.config.road.parcelInset
        };
        const width = bounds.maxX - bounds.minX;
        const depth = bounds.maxZ - bounds.minZ;
        if (width < this.config.road.minBlockSize || depth < this.config.road.minBlockSize) continue;
        if (width > this.config.road.maxBlockSize || depth > this.config.road.maxBlockSize) continue;
        const id = `block:${coord.x}:${coord.z}:${xIndex}:${zIndex}`;
        const block: CityBlock = { id, region: coord, bounds, area: width * depth };
        blocks.push(block);
        const center = { x: (bounds.minX + bounds.maxX) / 2, z: (bounds.minZ + bounds.maxZ) / 2 };
        const facingRoadId = findClosestRoadId(center, segments, nodeMap);
        parcels.push({ id: `parcel:${id}`, blockId: id, center, width, depth, facingRoadId });
      }
    }
    return { blocks, parcels };
  }
}

export function isRoadGradeSafe(
  start: RoadPoint,
  end: RoadPoint,
  getHeight: TerrainHeightQuery,
  maxRoadGrade: number,
  sampleSpacing: number
): boolean {
  const length = Math.hypot(end.x - start.x, end.z - start.z);
  const sampleCount = Math.max(1, Math.ceil(length / sampleSpacing));
  let previousHeight = getHeight(start.x, start.z);
  for (let index = 1; index <= sampleCount; index += 1) {
    const amount = index / sampleCount;
    const x = start.x + (end.x - start.x) * amount;
    const z = start.z + (end.z - start.z) * amount;
    const height = getHeight(x, z);
    const horizontalStep = length / sampleCount;
    if (Math.abs(height - previousHeight) / horizontalStep > maxRoadGrade) return false;
    previousHeight = height;
  }
  return true;
}

function randomUnit(seed: string, key: string): number {
  return hashStringToSeed(`${seed}:${key}`) / 0xffff_ffff;
}

function getOrCreateNode(nodes: Map<string, RoadNode>, point: RoadPoint): RoadNode {
  const id = roadNodeId(point);
  const existing = nodes.get(id);
  if (existing !== undefined) return existing;
  const node = { id, ...point };
  nodes.set(id, node);
  return node;
}

function getAxisBoundaries(lines: readonly RoadLine[], axis: RoadLine['axis'], minimum: number, maximum: number): AxisBoundary[] {
  const boundaries: AxisBoundary[] = [{ coordinate: minimum, width: 0 }];
  for (const line of lines.filter((candidate) => candidate.axis === axis).sort((left, right) => left.coordinate - right.coordinate)) {
    boundaries.push({ coordinate: line.coordinate, width: line.width });
  }
  boundaries.push({ coordinate: maximum, width: 0 });
  return boundaries;
}

function findClosestRoadId(center: RoadPoint, segments: readonly RoadSegment[], nodes: ReadonlyMap<string, RoadNode>): string {
  let closest: RoadSegment | undefined;
  let closestDistance = Number.POSITIVE_INFINITY;
  for (const segment of segments) {
    const start = nodes.get(segment.startNodeId);
    const end = nodes.get(segment.endNodeId);
    if (start === undefined || end === undefined) continue;
    const distance = distanceToSegmentSquared(center, start, end);
    if (distance < closestDistance || (distance === closestDistance && (closest === undefined || segment.id < closest.id))) {
      closest = segment;
      closestDistance = distance;
    }
  }
  return closest?.id ?? 'road:none';
}

function distanceToSegmentSquared(point: RoadPoint, start: RoadPoint, end: RoadPoint): number {
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const lengthSquared = dx * dx + dz * dz;
  if (lengthSquared === 0) return (point.x - start.x) ** 2 + (point.z - start.z) ** 2;
  const amount = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.z - start.z) * dz) / lengthSquared));
  const x = start.x + dx * amount;
  const z = start.z + dz * amount;
  return (point.x - x) ** 2 + (point.z - z) ** 2;
}
