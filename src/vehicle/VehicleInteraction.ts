import type { GameConfig } from '../core/Config';
import { getVehicleForward } from '../render/VehicleCameraMath';
import type { VehicleState } from './VehicleState';

export interface ExitCandidate {
  readonly x: number;
  readonly z: number;
  readonly label: 'driver' | 'passenger' | 'rearLeft' | 'rearRight' | 'frontLeft' | 'frontRight';
}

export function isVehicleEnterEligible(
  player: { readonly x: number; readonly z: number },
  vehicle: VehicleState,
  enterDistance: number
): boolean {
  return !vehicle.occupied && Math.hypot(player.x - vehicle.position.x, player.z - vehicle.position.z) <= enterDistance;
}

export function getVehicleExitCandidates(
  vehicle: VehicleState,
  config: GameConfig['vehicle']
): readonly ExitCandidate[] {
  const forward = getVehicleForward(vehicle.yaw);
  const left = { x: -forward.z, z: forward.x };
  const side = config.sedan.chassisWidth / 2 + config.interaction.exitDistance;
  const front = config.sedan.chassisLength * 0.28;
  const rear = -config.sedan.chassisLength * 0.34;
  const at = (sideSign: number, longitudinal: number, label: ExitCandidate['label']): ExitCandidate => ({
    x: vehicle.position.x + left.x * side * sideSign + forward.x * longitudinal,
    z: vehicle.position.z + left.z * side * sideSign + forward.z * longitudinal,
    label
  });
  return [
    at(1, front, 'driver'),
    at(-1, front, 'passenger'),
    at(1, rear, 'rearLeft'),
    at(-1, rear, 'rearRight'),
    at(1, config.sedan.chassisLength * 0.48, 'frontLeft'),
    at(-1, config.sedan.chassisLength * 0.48, 'frontRight')
  ];
}

export function findSafeExitCandidate<T extends ExitCandidate>(
  candidates: readonly T[],
  isSafe: (candidate: T) => boolean
): T | undefined {
  return candidates.find(isSafe);
}
