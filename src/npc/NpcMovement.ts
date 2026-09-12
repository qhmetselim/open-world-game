import type { PedestrianNode } from '../city/UrbanMobility';
import type { NpcState } from './NpcTypes';

export function stepNpcTowardWaypoint(
  state: NpcState,
  target: PedestrianNode,
  speed: number,
  reachDistance: number,
  deltaSeconds: number,
  targetSurfaceHeight: number = state.position.y
): boolean {
  const dx = target.position.x - state.position.x;
  const dz = target.position.z - state.position.z;
  const distance = Math.hypot(dx, dz);
  if (distance <= reachDistance) {
    state.position.x = target.position.x;
    state.position.y = targetSurfaceHeight;
    state.position.z = target.position.z;
    state.currentNodeId = target.id;
    return true;
  }
  const step = Math.min(distance, speed * deltaSeconds);
  state.position.x += dx / distance * step;
  state.position.y += (targetSurfaceHeight - state.position.y) * (step / distance);
  state.position.z += dz / distance * step;
  state.facingYaw = approachAngle(state.facingYaw, Math.atan2(dx, dz), 8 * deltaSeconds);
  return false;
}

export function shouldActivateNpc(distance: number, activeRadius: number, deactivateRadius: number, wasActive: boolean): boolean {
  return wasActive ? distance <= deactivateRadius : distance <= activeRadius;
}

export function approachAngle(current: number, target: number, maxDelta: number): number {
  const difference = Math.atan2(Math.sin(target - current), Math.cos(target - current));
  return Math.abs(difference) <= maxDelta ? target : current + Math.sign(difference) * maxDelta;
}

export function approachSpeed(current: number, target: number, acceleration: number, deceleration: number, dt: number): number {
  const delta = (target > current ? acceleration : deceleration) * dt;
  return current + Math.sign(target - current) * Math.min(Math.abs(target - current), delta);
}

/** Anticipate pose rotation, but keep feet inside the authored sidewalk/crossing path. */
export function anticipatedFacing(position: { x: number; z: number }, corner: { x: number; z: number }, next: { x: number; z: number } | undefined, distance: number): number {
  const yaw = Math.atan2(corner.x - position.x, corner.z - position.z);
  if (!next) return yaw;
  const nextYaw = Math.atan2(next.x - corner.x, next.z - corner.z);
  const blend = .5 * Math.max(0, 1 - Math.hypot(corner.x - position.x, corner.z - position.z) / distance);
  return yaw + Math.atan2(Math.sin(nextYaw - yaw), Math.cos(nextYaw - yaw)) * blend;
}
