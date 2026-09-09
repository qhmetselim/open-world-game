export interface VehicleState {
  id: string; type: 'sedan'; position: { x: number; y: number; z: number }; yaw: number;
  velocity: { x: number; y: number; z: number }; speed: number; steering: number; throttle: number; brake: number;
  occupied: boolean; driverId: string | undefined; wheelContactCount: number;
}
export function createVehicleState(id: string, position: VehicleState['position'], yaw: number): VehicleState {
  return { id, type: 'sedan', position: { ...position }, yaw, velocity: { x: 0, y: 0, z: 0 }, speed: 0, steering: 0, throttle: 0, brake: 0, occupied: false, driverId: undefined, wheelContactCount: 0 };
}
export function serializeVehicleState(state: VehicleState): VehicleState { return JSON.parse(JSON.stringify(state)) as VehicleState; }
