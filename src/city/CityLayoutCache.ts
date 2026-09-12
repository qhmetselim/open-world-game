import type { GameConfig } from '../core/Config';
import { cityRegionKey, worldPositionToCityRegion } from './CityTypes';
import type { CityRegionCoord, CityRegionLayout, RoadPoint } from './CityTypes';
import { CityLayoutGenerator } from './CityLayoutGenerator';
import type { TerrainHeightQuery } from './CityLayoutGenerator';

export class CityLayoutCache {
  private readonly generator: CityLayoutGenerator;
  private readonly regions = new Map<string, CityRegionLayout>();

  public constructor(
    seed: string,
    private readonly config: GameConfig['city'],
    getTerrainHeight: TerrainHeightQuery
  ) {
    this.generator = new CityLayoutGenerator(seed, config, getTerrainHeight);
  }

  public getRegion(coord: CityRegionCoord): CityRegionLayout {
    const key = cityRegionKey(coord);
    const existing = this.regions.get(key);
    if (existing !== undefined) {
      this.regions.delete(key);
      this.regions.set(key, existing);
      return existing;
    }
    const generated = this.generator.generateRegion(coord);
    this.regions.set(key, generated);
    this.trimCache();
    return generated;
  }

  public getRegionsForBounds(minX: number, maxX: number, minZ: number, maxZ: number): CityRegionLayout[] {
    const first = worldPositionToCityRegion({ x: minX, z: minZ }, this.config.regionSize);
    const last = worldPositionToCityRegion({ x: maxX - Number.EPSILON, z: maxZ - Number.EPSILON }, this.config.regionSize);
    const regions: CityRegionLayout[] = [];
    for (let z = first.z; z <= last.z; z += 1) {
      for (let x = first.x; x <= last.x; x += 1) regions.push(this.getRegion({ x, z }));
    }
    return regions;
  }

  public getRegionAt(position: RoadPoint): CityRegionLayout {
    return this.getRegion(worldPositionToCityRegion(position, this.config.regionSize));
  }

  public get cachedRegionCount(): number {
    return this.regions.size;
  }

  public clear(): void { this.regions.clear(); }

  private trimCache(): void {
    while (this.regions.size > this.config.layoutCacheSize) {
      const oldest = this.regions.keys().next().value;
      if (oldest === undefined) return;
      this.regions.delete(oldest);
    }
  }
}
