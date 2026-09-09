import type { EntityId, EntityState } from './Entity';

export interface RegionState {
  readonly id: string;
  readonly active: boolean;
}

export interface SerializableWorldState {
  readonly seed: number;
  readonly entities: readonly EntityState[];
  readonly regions: readonly RegionState[];
}

export class WorldState {
  private readonly entities = new Map<EntityId, EntityState>();
  private readonly regions = new Map<string, RegionState>();

  public constructor(public readonly seed: number) {}

  public addEntity(entity: EntityState): void {
    this.entities.set(entity.id, entity);
  }

  public getEntity(id: EntityId): EntityState | undefined {
    return this.entities.get(id);
  }

  public setRegionActive(id: string, active: boolean): void {
    this.regions.set(id, { id, active });
  }

  public serialize(): SerializableWorldState {
    return {
      seed: this.seed,
      entities: [...this.entities.values()],
      regions: [...this.regions.values()]
    };
  }
}
