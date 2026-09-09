import type { GameConfig } from '../core/Config';
import type { VehicleState } from '../vehicle/VehicleState';
import type { CameraPosition } from './ThirdPersonCameraMath';

export function getVehicleForward(yaw: number): { readonly x: number; readonly z: number } {
  // Rapier's controller is configured with Z as its forward axis, so the sedan's local +Z is forward.
  return { x: Math.sin(yaw), z: Math.cos(yaw) };
}

export function getVehicleCameraTarget(
  vehicle: VehicleState,
  config: GameConfig['vehicle']['camera']
): CameraPosition {
  const forward = getVehicleForward(vehicle.yaw);
  return {
    x: vehicle.position.x + forward.x * config.lookAhead,
    y: vehicle.position.y + config.targetHeight,
    z: vehicle.position.z + forward.z * config.lookAhead
  };
}

export function getVehicleCameraDesiredPosition(
  vehicle: VehicleState,
  orbitYaw: number,
  pitch: number,
  config: GameConfig['vehicle']['camera']
): CameraPosition {
  const target = getVehicleCameraTarget(vehicle, config);
  const yaw = vehicle.yaw + orbitYaw;
  const horizontalDistance = Math.cos(pitch) * config.distance;
  return {
    x: target.x - Math.sin(yaw) * horizontalDistance,
    y: target.y + config.height + Math.sin(pitch) * config.distance,
    z: target.z - Math.cos(yaw) * horizontalDistance
  };
}
