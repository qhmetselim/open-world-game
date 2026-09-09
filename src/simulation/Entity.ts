export type EntityId = string;

export interface EntityState {
  readonly id: EntityId;
  readonly kind: string;
  readonly position: readonly [number, number, number];
  readonly active: boolean;
}

export function createEntityState(id: EntityId, kind: string, position: EntityState['position']): EntityState {
  return { id, kind, position, active: true };
}
