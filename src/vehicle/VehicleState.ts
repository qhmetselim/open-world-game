export interface VehicleState {
  id: string;
  type: 'sedan';
  position: { x: number; y: number; z: number };
  yaw: number;
  rotation: { x: number; y: number; z: number; w: number };
  velocity: { x: number; y: number; z: number };
  speed: number;
  forwardSpeed: number;
  steering: number;
  throttle: number;
  brake: number;
  occupied: boolean;
  driverId: string | undefined;
  wheelContactCount: number;
  reverse: boolean;
  handbrake: boolean;
  wheelRotations: readonly [number, number, number, number];
}

export function createVehicleState(id: string, position: VehicleState['position'], yaw: number): VehicleState {
  return {
    id,
    type: 'sedan',
    position: { ...position },
    yaw,
    rotation: { x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) },
    velocity: { x: 0, y: 0, z: 0 },
    speed: 0,
    forwardSpeed: 0,
    steering: 0,
    throttle: 0,
    brake: 0,
    occupied: false,
    driverId: undefined,
    wheelContactCount: 0,
    reverse: false,
    handbrake: false,
    wheelRotations: [0, 0, 0, 0]
  };
}

export function serializeVehicleState(state: VehicleState): VehicleState {
  return {
    ...state,
    position: { ...state.position },
    rotation: { ...state.rotation },
    velocity: { ...state.velocity },
    wheelRotations: [...state.wheelRotations] as VehicleState['wheelRotations']
  };
}
