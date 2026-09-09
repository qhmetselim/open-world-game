import type { GameConfig } from '../core/Config';
import type { CityRegionCoord, CityRegionLayout, RoadPoint } from '../city/CityTypes';
import { worldPositionToCityRegion } from '../city/CityTypes';
import { BuildingGenerator } from './BuildingGenerator';
import type { TerrainHeightQuery } from './BuildingGenerator';
import type { BuildingData, BuildingRegionLayout } from './BuildingTypes';

export class BuildingLayoutCache {
  private readonly generator: BuildingGenerator;
  private readonly regions = new Map<string, BuildingRegionLayout>();

  public constructor(
    seed: string,
    private readonly cityConfig: GameConfig['city'],
    private readonly buildingConfig: GameConfig['building'],
    getCityRegion: (coord: CityRegionCoord) => CityRegionLayout,
    terrainHeight: TerrainHeightQuery,
    spawnPosition: { readonly x: number; readonly z: number }
  ) {
    this.generator = new BuildingGenerator(seed, buildingConfig, terrainHeight, spawnPosition);
    this.getCityRegion = getCityRegion;
  }

  private readonly getCityRegion: (coord: CityRegionCoord) => CityRegionLayout;

  public getRegion(coord: CityRegionCoord): BuildingRegionLayout {
    const key = `${coord.x}:${coord.z}`;
    const cached = this.regions.get(key);
    if (cached !== undefined) {
      this.regions.delete(key);
      this.regions.set(key, cached);
      return cached;
    }
    const region = this.generator.generateRegion(this.getCityRegion(coord));
    this.regions.set(key, region);
    this.trim();
    return region;
  }

  public getBuildingsForChunk(origin: RoadPoint, chunkSize: number): BuildingData[] {
    const region = worldPositionToCityRegion(origin, this.cityConfig.regionSize);
    return this.getRegion(region).buildings.filter((building) =>
      Math.floor(building.x / chunkSize) === Math.floor(origin.x / chunkSize)
      && Math.floor(building.z / chunkSize) === Math.floor(origin.z / chunkSize)
    );
  }

  public getBuildingsInRegion(coord: CityRegionCoord): readonly BuildingData[] {
    return this.getRegion(coord).buildings;
  }

  public getBuildingById(id: string): BuildingData | undefined {
    const parts = id.split(':');
    const regionX = Number(parts[1]);
    const regionZ = Number(parts[2]);
    if (!Number.isFinite(regionX) || !Number.isFinite(regionZ)) return undefined;
    return this.getRegion({ x: regionX, z: regionZ }).buildings.find((building) => building.id === id);
  }

  public get cachedRegionCount(): number {
    return this.regions.size;
  }

  private trim(): void {
    while (this.regions.size > this.buildingConfig.layoutCacheSize) {
      const oldest = this.regions.keys().next().value;
      if (oldest === undefined) return;
      this.regions.delete(oldest);
    }
  }
}
