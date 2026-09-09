import type { GameConfig } from '../core/Config';
import type { CameraRelativeBasis } from '../player/PlayerMovement';
import type { PlayerVector3 } from '../player/PlayerState';

export type CameraPosition = PlayerVector3;

export function clampCameraPitch(pitch: number, minPitch: number, maxPitch: number): number {
  return Math.min(Math.max(pitch, minPitch), maxPitch);
}

/**
 * Pointer-lock convention: browser movementX is positive when the physical mouse
 * moves right, and positive yaw turns the rendered view to the right.
 * Vertical input intentionally retains the existing inverted-screen convention.
 */
export function applyPointerLook(
  yaw: number,
  pitch: number,
  deltaX: number,
  deltaY: number,
  sensitivity: number,
  minPitch: number,
  maxPitch: number
): { readonly yaw: number; readonly pitch: number } {
  return {
    yaw: yaw + deltaX * sensitivity,
    pitch: clampCameraPitch(pitch - deltaY * sensitivity, minPitch, maxPitch)
  };
}

export function getCameraRelativeBasis(yaw: number): CameraRelativeBasis {
  return {
    forward: { x: Math.sin(yaw), z: -Math.cos(yaw) },
    right: { x: Math.cos(yaw), z: Math.sin(yaw) }
  };
}

export function getThirdPersonTarget(playerPosition: PlayerVector3, targetHeight: number): CameraPosition {
  return { x: playerPosition.x, y: playerPosition.y + targetHeight, z: playerPosition.z };
}

export function getThirdPersonDesiredPosition(
  playerPosition: PlayerVector3,
  yaw: number,
  pitch: number,
  config: GameConfig['camera']
): CameraPosition {
  const target = getThirdPersonTarget(playerPosition, config.targetHeight);
  const horizontalDistance = Math.cos(pitch) * config.distance;
  return {
    x: target.x - Math.sin(yaw) * horizontalDistance,
    y: target.y + Math.sin(pitch) * config.distance,
    z: target.z + Math.cos(yaw) * horizontalDistance
  };
}
