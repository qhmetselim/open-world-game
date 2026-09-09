import type { GameConfig } from '../core/Config';

export interface HorizontalDirection {
  readonly x: number;
  readonly z: number;
}

export interface CameraRelativeBasis {
  readonly forward: HorizontalDirection;
  readonly right: HorizontalDirection;
}

export interface MovementActions {
  readonly forward: boolean;
  readonly backward: boolean;
  readonly left: boolean;
  readonly right: boolean;
  readonly sprint: boolean;
}

export function calculateHorizontalVelocity(
  actions: MovementActions,
  basis: CameraRelativeBasis,
  walkSpeed: number,
  sprintSpeed: number
): HorizontalDirection {
  const forwardInput = Number(actions.forward) - Number(actions.backward);
  const rightInput = Number(actions.right) - Number(actions.left);
  const magnitude = Math.hypot(forwardInput, rightInput);
  if (magnitude === 0) return { x: 0, z: 0 };

  const speed = actions.sprint ? sprintSpeed : walkSpeed;
  return {
    x: ((basis.forward.x * forwardInput + basis.right.x * rightInput) / magnitude) * speed,
    z: ((basis.forward.z * forwardInput + basis.right.z * rightInput) / magnitude) * speed
  };
}

export function calculateFacingYaw(direction: HorizontalDirection): number | undefined {
  if (direction.x === 0 && direction.z === 0) return undefined;
  return Math.atan2(direction.x, -direction.z);
}

export function approachAngle(current: number, target: number, maxDelta: number): number {
  const difference = Math.atan2(Math.sin(target - current), Math.cos(target - current));
  if (Math.abs(difference) <= maxDelta) return target;
  return current + Math.sign(difference) * maxDelta;
}

export function resolveVerticalVelocity(
  velocityY: number,
  grounded: boolean,
  jumpRequested: boolean,
  deltaSeconds: number,
  config: GameConfig['player']
): number {
  if (grounded && jumpRequested) return config.jumpSpeed;
  if (grounded && velocityY < 0) return 0;
  return velocityY - config.gravity * deltaSeconds;
}

export function getCapsuleCenterHeight(terrainHeight: number, config: GameConfig['player']): number {
  return terrainHeight + config.capsuleHalfHeight + config.capsuleRadius + config.controllerOffset;
}

export function shouldRecoverPlayer(positionY: number, killY: number): boolean {
  return positionY < killY;
}
