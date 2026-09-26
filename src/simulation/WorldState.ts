import type { EntityId, EntityState } from './Entity';
import type { SerializedPlayerState } from '../player/PlayerState';
import type { PersonalAssets, PersonalAssetsState } from '../economy/PersonalAssets';
import type { WantedState } from '../police/Wanted';

export interface RegionState {
  readonly id: string;
  readonly active: boolean;
}

export interface SerializableWorldState {
  readonly seed: string;
  readonly entities: readonly EntityState[];
  readonly regions: readonly RegionState[];
  readonly player?: SerializedPlayerState;
  readonly personalAssets?: PersonalAssetsState;
  readonly wanted?:WantedState;
}

export class WorldState {
  private readonly entities = new Map<EntityId, EntityState>();
  private readonly regions = new Map<string, RegionState>();
  private player: SerializedPlayerState | undefined;
  private personalAssets: PersonalAssets | undefined;
  private wanted:WantedState|undefined;
  public setWanted(state:WantedState):void{this.wanted=state;}
  public setPersonalAssets(assets: PersonalAssets): void { this.personalAssets = assets; }

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
      regions: [...this.regions.values()],
      ...(this.personalAssets ? { personalAssets: this.personalAssets.serialize() } : {}),
      ...(this.wanted?{wanted:{...this.wanted,lastKnown:{...this.wanted.lastKnown}}}:{})
    };
    return this.player === undefined ? state : { ...state, player: this.player };
  }
}
