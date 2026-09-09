import { describe, expect, it } from 'vitest';
import { defaultGameConfig } from '../core/Config';
import { CityLayoutGenerator } from '../city/CityLayoutGenerator';
import type { CityRegionLayout } from '../city/CityTypes';
import { getBuildingFootprintCorners, getBuildingFrontDirection, isPointWithinBuildingSafetyRadius } from './BuildingGeometry';
import { BuildingGenerator, calculateFoundationElevation } from './BuildingGenerator';
import { BuildingLayoutCache } from './BuildingLayoutCache';

const flatTerrain = (): number => 0;
const cityLayout = new CityLayoutGenerator(defaultGameConfig.world.seed, defaultGameConfig.city, flatTerrain).generateRegion({ x: 0, z: 0 });

function createGenerator(seed = defaultGameConfig.world.seed, spawn = defaultGameConfig.player.spawnPosition): BuildingGenerator {
  return new BuildingGenerator(seed, defaultGameConfig.building, flatTerrain, spawn);
}

describe('BuildingGenerator', () => {
  it('produces the same building set for the same seed and region', () => {
    const first = createGenerator().generateRegion(cityLayout);
    const second = createGenerator().generateRegion(cityLayout);

    expect(second).toEqual(first);
  });

  it('changes buildings meaningfully with another world seed', () => {
    const first = createGenerator('open-world-001').generateRegion(cityLayout);
    const second = createGenerator('different-building-world').generateRegion(cityLayout);

    expect(second.buildings).not.toEqual(first.buildings);
  });

  it('has stable IDs, types, floors, and facade styles regardless of generation order', () => {
    const generator = createGenerator();
    generator.generateRegion(new CityLayoutGenerator(defaultGameConfig.world.seed, defaultGameConfig.city, flatTerrain).generateRegion({ x: 1, z: 0 }));
    const afterOtherRegion = generator.generateRegion(cityLayout);
    const direct = createGenerator().generateRegion(cityLayout);

    expect(afterOtherRegion).toEqual(direct);
    expect(new Set(direct.buildings.map((building) => building.id)).size).toBe(direct.buildings.length);
    expect(direct.buildings.every((building) => building.floors > 0 && building.style.facadePaletteIndex >= 0)).toBe(true);
  });

  it('keeps footprints within parcel bounds and preserves road-facing entrances', () => {
    const layout = createGenerator().generateRegion(cityLayout);
    for (const building of layout.buildings) {
      const parcel = cityLayout.parcels.find((candidate) => candidate.id === building.parcelId);
      expect(parcel).toBeDefined();
      for (const corner of getBuildingFootprintCorners(building)) {
        expect(corner.x).toBeGreaterThanOrEqual((parcel?.center.x ?? 0) - (parcel?.width ?? 0) / 2);
        expect(corner.x).toBeLessThanOrEqual((parcel?.center.x ?? 0) + (parcel?.width ?? 0) / 2);
        expect(corner.z).toBeGreaterThanOrEqual((parcel?.center.z ?? 0) - (parcel?.depth ?? 0) / 2);
        expect(corner.z).toBeLessThanOrEqual((parcel?.center.z ?? 0) + (parcel?.depth ?? 0) / 2);
      }
      const front = getBuildingFrontDirection(building.rotation);
      expect(building.entrance.directionX).toBeCloseTo(front.x);
      expect(building.entrance.directionZ).toBeCloseTo(front.z);
    }
  });

  it('respects spawn safety and rejects a parcel that cannot fit setbacks', () => {
    const layout = createGenerator().generateRegion(cityLayout);
    expect(layout.buildings.every((building) => !isPointWithinBuildingSafetyRadius(building, defaultGameConfig.player.spawnPosition, defaultGameConfig.building.spawnSafetyRadius))).toBe(true);

    const tinyLayout: CityRegionLayout = {
      ...cityLayout,
      parcels: [{ ...cityLayout.parcels[0]!, id: 'parcel:tiny', width: 4, depth: 4 }]
    };
    expect(createGenerator().generateRegion(tinyLayout).buildings).toHaveLength(0);
  });

  it('calculates deterministic upright foundation elevation from terrain samples', () => {
    const terrain = (x: number, z: number): number => x * 0.02 - z * 0.01;
    const first = calculateFoundationElevation({ x: 10, z: 10 }, 12, 8, Math.PI / 2, terrain);
    const second = calculateFoundationElevation({ x: 10, z: 10 }, 12, 8, Math.PI / 2, terrain);

    expect(second).toEqual(first);
    expect(first.maximum).toBeGreaterThanOrEqual(first.minimum);
  });

  it('regenerates an evicted building region identically and supports query APIs', () => {
    const cityGenerator = new CityLayoutGenerator(defaultGameConfig.world.seed, defaultGameConfig.city, flatTerrain);
    const cache = new BuildingLayoutCache(
      defaultGameConfig.world.seed,
      defaultGameConfig.city,
      { ...defaultGameConfig.building, layoutCacheSize: 2 },
      (coord) => cityGenerator.generateRegion(coord),
      flatTerrain,
      defaultGameConfig.player.spawnPosition
    );
    const first = cache.getRegion({ x: 0, z: 0 });
    cache.getRegion({ x: 1, z: 0 });
    cache.getRegion({ x: 2, z: 0 });
    const reloaded = cache.getRegion({ x: 0, z: 0 });

    expect(reloaded).toEqual(first);
    expect(cache.cachedRegionCount).toBeLessThanOrEqual(2);
    const building = reloaded.buildings[0];
    expect(building === undefined ? undefined : cache.getBuildingById(building.id)).toEqual(building);
  });
});
