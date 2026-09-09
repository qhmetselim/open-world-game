import type { EntityId, EntityState } from './Entity';
import type { SerializedPlayerState } from '../player/PlayerState';

export interface RegionState {
  readonly id: string;
  readonly active: boolean;
}

export interface SerializableWorldState {
  readonly seed: string;
  readonly entities: readonly EntityState[];
  readonly regions: readonly RegionState[];
  readonly player?: SerializedPlayerState;
}

export class WorldState {
  private readonly entities = new Map<EntityId, EntityState>();
  private readonly regions = new Map<string, RegionState>();
  private player: SerializedPlayerState | undefined;

  public constructor(public readonly seed: string) {}

  public addEntity(entity: EntityState): void {
    this.entities.set(entity.id, entity);
  }

  public getEntity(id: EntityId): EntityState | undefined {
    return this.entities.get(id);
  }

  public setRegionActive(id: string, active: boolean): void {
    this.regions.set(id, { id, active });
  }

  public setPlayerState(player: SerializedPlayerState): void {
    this.player = player;
  }

  public serialize(): SerializableWorldState {
    const state: SerializableWorldState = {
      seed: this.seed,
      entities: [...this.entities.values()],
      regions: [...this.regions.values()]
    };
    return this.player === undefined ? state : { ...state, player: this.player };
  }
}
