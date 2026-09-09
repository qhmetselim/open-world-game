export type NpcActivity = 'walking' | 'idle' | 'waiting';
export type NpcSimulationTier = 'active' | 'background';
export type NpcPresentation = 'feminine' | 'masculine';

export interface NpcIdentity {
  readonly id: string;
  readonly displayName: string;
  readonly presentation: NpcPresentation;
  readonly age: number;
  readonly appearanceSeed: number;
  readonly clothingSeed: number;
  readonly districtId: string;
  readonly walkSpeed: number;
}

export interface NpcAppearance {
  readonly heightScale: number;
  readonly widthScale: number;
  readonly shirtColor: number;
  readonly pantsColor: number;
  readonly skinColor: number;
  readonly hairColor: number;
  readonly hairStyle: number;
}

export interface NpcState {
  readonly id: string;
  position: { x: number; y: number; z: number };
  facingYaw: number;
  currentNodeId: string;
  destinationNodeId: string | undefined;
  pathNodeIds: string[];
  pathIndex: number;
  activity: NpcActivity;
  tier: NpcSimulationTier;
  idleRemaining: number;
  tripIndex: number;
  backgroundElapsed: number;
  readonly appearance: NpcAppearance;
}

export type SerializedNpcState = NpcState;

export function serializeNpcState(state: NpcState): SerializedNpcState {
  return {
    ...state,
    position: { ...state.position },
    pathNodeIds: [...state.pathNodeIds],
    appearance: { ...state.appearance }
  };
}
