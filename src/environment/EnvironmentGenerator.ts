import type { BuildingData } from '../buildings/BuildingTypes';
import { resolveRoadSegment } from '../city/CityTypes';
import type { CityRegionLayout, ResolvedRoadSegment, RoadPoint } from '../city/CityTypes';
import { hashStringToSeed as hashSeed } from '../world/SeededNoise';
import { environmentConfig as config } from './EnvironmentConfig';

export type PropKind = 'tree' | 'bush' | 'lamp' | 'bench' | 'bin' | 'sign' | 'bollard' | 'utility';
export type EnvironmentProfile = keyof typeof config.profiles;
export interface EnvironmentProp {
  readonly id: string; readonly kind: PropKind;
  readonly x: number; readonly y: number; readonly z: number;
  readonly yaw: number; readonly scale: number; readonly variation: number;
}
export interface EnvironmentChunkData {
  readonly profile: EnvironmentProfile; readonly props: readonly EnvironmentProp[];
}
const radii: Record<PropKind, number> = { tree: 2.8, bush: 1.1, lamp: 1.2, bench: 1.2, bin: 0.45, sign: 0.7, bollard: 0.25, utility: 0.65 };
const sequence: readonly PropKind[] = ['lamp', 'tree', 'bin', 'lamp', 'bench', 'bush', 'lamp', 'sign', 'bollard', 'tree', 'utility'];
const random = (key: string): number => hashSeed(key) / 4294967296;

export function environmentProfile(seed: string, layout: CityRegionLayout): EnvironmentProfile {
  return !layout.isUrban ? 'outskirts' : random(`${seed}:environment:${layout.key}`) < 0.55 ? 'residential' : 'urban';
}

export function distanceToRoad(point: RoadPoint, road: ResolvedRoadSegment): number {
  const dx = road.end.x - road.start.x; const dz = road.end.z - road.start.z;
  const t = Math.max(0, Math.min(1, ((point.x - road.start.x) * dx + (point.z - road.start.z) * dz) / Math.max(dx * dx + dz * dz, 1e-9)));
  return Math.hypot(point.x - road.start.x - dx * t, point.z - road.start.z - dz * t);
}

export function hasBuildingClearance(point: RoadPoint, radius: number, buildings: readonly BuildingData[]): boolean {
  return buildings.every((building) => {
    const dx = point.x - building.x; const dz = point.z - building.z;
    const c = Math.cos(building.rotation); const s = Math.sin(building.rotation);
    const outsideX = Math.max(Math.abs(dx * c - dz * s) - building.width / 2, 0);
    const outsideZ = Math.max(Math.abs(dx * s + dz * c) - building.depth / 2, 0);
    return Math.hypot(outsideX, outsideZ) > radius + config.buildingClearance
      && Math.hypot(point.x - building.entrance.x, point.z - building.entrance.z) > radius + config.entranceClearance;
  });
}

/** Global road slots and scatter cells; half-open centre ownership prevents cross-chunk duplicates. */
export function generateEnvironment(
  seed: string, origin: RoadPoint, chunkSize: number, layouts: readonly CityRegionLayout[],
  buildings: readonly BuildingData[], sidewalkWidth: number, height: (x: number, z: number) => number,
  spawn: RoadPoint, profile: EnvironmentProfile, regionSize: number
): EnvironmentChunkData {
  const roadMap = new Map<string, ResolvedRoadSegment>();
  const orderedLayouts = [...layouts].sort((a, b) => a.key.localeCompare(b.key));
  for (const layout of orderedLayouts) {
    const nodes = new Map(layout.nodes.map((node) => [node.id, node]));
    for (const road of layout.segments) roadMap.set(road.id, resolveRoadSegment(road, nodes));
  }
  const roads = [...roadMap.values()].sort((a, b) => a.id.localeCompare(b.id));
  const props: EnvironmentProp[] = [];
  const owns = (x: number, z: number) => x >= origin.x && x < origin.x + chunkSize && z >= origin.z && z < origin.z + chunkSize;
  const add = (id: string, kind: PropKind, x: number, z: number, yaw: number) => {
    if (!owns(x, z) || props.length >= config.maxPropsPerChunk) return;
    const scale = 0.85 + random(`${seed}:${id}:scale`) * 0.3;
    const radius = radii[kind] * scale;
    if (Math.hypot(x - spawn.x, z - spawn.z) < config.spawnClearance + radius) return;
    if (!hasBuildingClearance({ x, z }, radius, buildings)) return;
    for (const road of roads) {
      if (distanceToRoad({ x, z }, road) < road.width / 2 + sidewalkWidth + radius + 0.1) return;
      const clearance = road.width / 2 + sidewalkWidth + config.intersectionClearance + radius;
      if (Math.hypot(x - road.start.x, z - road.start.z) < clearance || Math.hypot(x - road.end.x, z - road.end.z) < clearance) return;
    }
    const y = height(x, z);
    const support = kind === 'tree' ? 0.3 : kind === 'bush' ? 0.6 : radius;
    const samples = [height(x - support, z), height(x + support, z), height(x, z - support), height(x, z + support), y];
    if (!samples.every(Number.isFinite) || Math.max(...samples) - Math.min(...samples) > config.maxGroundVariation) return;
    // Bases extend below their feet plane; upright placement without terrain edits.
    props.push({ id, kind, x, y: Math.min(...samples), z, yaw, scale, variation: hashSeed(`${seed}:${id}:appearance`) });
  };
  for (const road of roads) {
    const dx = road.end.x - road.start.x; const dz = road.end.z - road.start.z; const length = Math.hypot(dx, dz);
    if (length < config.roadSpacing) continue;
    const roadLayout = orderedLayouts.find((layout) => layout.segments.some((segment) => segment.id === road.id));
    const density = config.profiles[roadLayout ? environmentProfile(seed, roadLayout) : profile].roadsideDensity;
    const phase = hashSeed(`${seed}:${road.id}:furniture`) % sequence.length;
    for (let index = 1; index * config.roadSpacing < length; index++) {
      for (const side of [-1, 1]) {
        const id = `environment:${road.id}:${index}:${side}`;
        if (random(`${seed}:${id}:occupied`) > density) continue;
        const kind = sequence[(index + phase + (side > 0 ? 3 : 0)) % sequence.length]!;
        const offset = road.width / 2 + sidewalkWidth + radii[kind] * 1.15 + config.roadsideGap;
        const x = road.start.x + dx / length * index * config.roadSpacing + dz / length * side * offset;
        const z = road.start.z + dz / length * index * config.roadSpacing - dx / length * side * offset;
        add(id, kind, x, z, Math.atan2(-dz * side, dx * side));
      }
    }
  }
  const cell = config.scatterCellSize;
  for (let cz = Math.floor(origin.z / cell); cz < Math.ceil((origin.z + chunkSize) / cell); cz++) {
    for (let cx = Math.floor(origin.x / cell); cx < Math.ceil((origin.x + chunkSize) / cell); cx++) {
      const id = `environment:green:${cx}:${cz}`;
      const x = (cx + 0.2 + random(`${seed}:${id}:x`) * 0.6) * cell;
      const z = (cz + 0.2 + random(`${seed}:${id}:z`) * 0.6) * cell;
      const layout = layouts.find((item) => item.key === `${Math.floor(x / regionSize)}:${Math.floor(z / regionSize)}`);
      const density = config.profiles[layout ? environmentProfile(seed, layout) : profile].vegetationDensity;
      if (random(`${seed}:${id}:occupied`) > density) continue;
      // Reserve the roadside furnishing band; scatter is only for open green areas.
      if (roads.some((road) => distanceToRoad({ x, z }, road) < road.width / 2 + sidewalkWidth + 12)) continue;
      add(id, random(`${seed}:${id}:kind`) > 0.45 ? 'tree' : 'bush', x, z, random(`${seed}:${id}:yaw`) * Math.PI * 2);
    }
  }
  return { profile, props: props.sort((a, b) => a.id.localeCompare(b.id)) };
}
