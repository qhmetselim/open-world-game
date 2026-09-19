import type { BuildingData } from '../buildings/BuildingTypes';
import { transformLocalPoint } from '../buildings/BuildingGeometry';
import { createEntranceDoor } from '../interaction/InteractionPlacement';
import type { Interactable, InteractionConfig } from '../interaction/InteractionState';

export const interiorConfig = {
  wallThickness: .2, corridorWidth: 3.2, openingWidth: 1.9,
  maximumEntryRise: .85, terrainSampleSpacing: 4, minimumSize: 8,
  activationDistance: 12, deactivationDistance: 20, slabThickness: .12
} as const;
/** Building-local boxes, Y relative to the exterior foundation's top. No render/physics objects. */
export interface InteriorBox { x: number; y: number; z: number; width: number; height: number; depth: number; pitch?: number }
export interface InteriorLayout {
  building: BuildingData;
  kind: 'groundFloor';
  door: Interactable;
  shell: readonly InteriorBox[];
  rooms: readonly InteriorBox[];
  ramp: InteriorBox;
  floorHeight: number;
}

/** One accessible entrance per owner chunk. Rejected buildings remain NON_ENTERABLE.
 * Terrain stays intact; a short vestibule ramp bridges modest foundation elevation differences. */
export function selectInterior(buildings: readonly BuildingData[], owner: string, interaction: InteractionConfig,
  floorHeight: number, height: (x: number, z: number) => number, clear: (x: number, z: number) => boolean): InteriorLayout | undefined {
  for (const building of [...buildings].sort((a, b) => a.id.localeCompare(b.id))) {
    const door = createEntranceDoor(building, owner, interaction, height, clear);
    if (!door || Math.min(building.width, building.depth) < interiorConfig.minimumSize) continue;
    const step = building.baseElevation - door.position.y;
    if (step < 0 || step > interiorConfig.maximumEntryRise) continue;
    let safe = true;
    const nx = Math.ceil(building.width / interiorConfig.terrainSampleSpacing);
    const nz = Math.ceil(building.depth / interiorConfig.terrainSampleSpacing);
    for (let ix = 0; ix <= nx; ix++) for (let iz = 0; iz <= nz; iz++) {
      const p = transformLocalPoint(building, (ix / nx - .5) * building.width, (iz / nz - .5) * building.depth);
      const y = height(p.x, p.z);
      if (!Number.isFinite(y) || y > building.baseElevation - .02) safe = false;
    }
    if (safe) return createInteriorLayout(building, door, floorHeight);
  }
  return undefined;
}

export function createInteriorLayout(building: BuildingData, door: Interactable, floorHeight: number): InteriorLayout {
  const { width: w, depth: d, height: h, foundationHeight: foundation } = building;
  const t = interiorConfig.wallThickness, opening = interiorConfig.openingWidth;
  const shell: InteriorBox[] = [
    { x: 0, y: -foundation / 2, z: 0, width: w, height: foundation, depth: d },
    { x: -(w - t) / 2, y: floorHeight / 2, z: 0, width: t, height: floorHeight, depth: d },
    { x: (w - t) / 2, y: floorHeight / 2, z: 0, width: t, height: floorHeight, depth: d },
    { x: 0, y: floorHeight / 2, z: (d - t) / 2, width: w, height: floorHeight, depth: t }
  ];
  for (const side of [-1, 1]) shell.push({ x: side * (w + opening) / 4, y: floorHeight / 2,
    z: -(d - t) / 2, width: (w - opening) / 2, height: floorHeight, depth: t });
  if (h > floorHeight) shell.push({ x: 0, y: (h + floorHeight) / 2, z: 0, width: w, height: h - floorHeight, depth: d });
  // Two rooms flank a central corridor; wide doorless openings connect all three spaces.
  const rooms: InteriorBox[] = [];
  const openingZ = ((building.seed % 3) - 1) * Math.min(1, d / 10);
  for (const side of [-1, 1]) {
    for (const [start, end] of [[-d / 2 + t, openingZ - opening / 2], [openingZ + opening / 2, d / 2 - t]]) {
      if (start === undefined || end === undefined) continue;
      rooms.push({ x: side * interiorConfig.corridorWidth / 2, y: floorHeight / 2, z: (start + end) / 2,
        width: t, height: floorHeight, depth: end - start });
    }
  }
  const rise = building.baseElevation - door.position.y;
  const length = Math.hypot(door.position.x - building.entrance.x, door.position.z - building.entrance.z) + .04;
  const pitch = -Math.atan2(rise, length), thickness = .1;
  const ramp = { x: 0, y: -rise / 2 - Math.cos(pitch) * thickness / 2,
    z: -d / 2 - length / 2 - Math.sin(pitch) * thickness / 2,
    width: opening, height: thickness, depth: Math.hypot(length, rise), pitch };
  return { building, kind: 'groundFloor', door, shell, rooms, ramp, floorHeight };
}

export function distanceToInterior(layout: InteriorLayout, position: { x: number; z: number }): number {
  const b = layout.building, dx = position.x - b.x, dz = position.z - b.z;
  const x = Math.cos(b.rotation) * dx - Math.sin(b.rotation) * dz;
  const z = Math.sin(b.rotation) * dx + Math.cos(b.rotation) * dz;
  return Math.hypot(Math.max(0, Math.abs(x) - b.width / 2), Math.max(0, Math.abs(z) - b.depth / 2));
}
