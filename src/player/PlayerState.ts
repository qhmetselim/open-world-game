export interface PlayerVector3 {
  x: number;
  y: number;
  z: number;
}

export interface PlayerState {
  readonly position: PlayerVector3;
  readonly velocity: PlayerVector3;
  grounded: boolean;
  facingYaw: number;
}

export interface SerializedPlayerState {
  readonly position: Readonly<PlayerVector3>;
  readonly velocity: Readonly<PlayerVector3>;
  readonly grounded: boolean;
  readonly facingYaw: number;
}

export function createPlayerState(position: PlayerVector3): PlayerState {
  return {
    position: { ...position },
    velocity: { x: 0, y: 0, z: 0 },
    grounded: false,
    facingYaw: 0
  };
}

export function serializePlayerState(state: PlayerState): SerializedPlayerState {
  return {
    position: { ...state.position },
    velocity: { ...state.velocity },
    grounded: state.grounded,
    facingYaw: state.facingYaw
  };
}
