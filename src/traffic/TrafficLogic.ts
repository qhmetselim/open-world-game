import type { LaneConnection, VehicleLane } from '../city/UrbanMobility';

export function trafficSpeedMultiplier(seed: number, minimum: number, maximum: number): number {
  const normalized = (seed >>> 0) / 0xffff_ffff;
  return minimum + (maximum - minimum) * normalized;
}

export function desiredTrafficSpeed(speedMetadataKmh: number, multiplier: number): number {
  return speedMetadataKmh / 3.6 * multiplier;
}

export function lanePointAtProgress(lane: VehicleLane, progress: number): { x: number; z: number } {
  const start = lane.path[0];
  const end = lane.path.at(-1);
  if (start === undefined || end === undefined) return { x: 0, z: 0 };
  const t = Math.max(0, Math.min(1, progress));
  return { x: start.x + (end.x - start.x) * t, z: start.z + (end.z - start.z) * t };
}

export function laneLength(lane: VehicleLane): number {
  const start = lane.path[0];
  const end = lane.path.at(-1);
  return start === undefined || end === undefined ? 0 : Math.hypot(end.x - start.x, end.z - start.z);
}

export function laneYaw(lane: VehicleLane): number {
  const start = lane.path[0];
  const end = lane.path.at(-1);
  return start === undefined || end === undefined ? 0 : Math.atan2(end.x - start.x, end.z - start.z);
}

export function signedAngle(fromYaw: number, toYaw: number): number {
  return Math.atan2(Math.sin(toYaw - fromYaw), Math.cos(toYaw - fromYaw));
}

/** Gameplay steering convention: left is negative, right is positive. */
export function laneSteering(currentYaw: number, target: { x: number; z: number }, position: { x: number; z: number }, gain: number, limit: number): number {
  const targetYaw = Math.atan2(target.x - position.x, target.z - position.z);
  return Math.max(-limit, Math.min(limit, signedAngle(currentYaw, targetYaw) * gain));
}

export function speedControl(currentSpeed: number, desiredSpeed: number, throttleGain: number, brakeGain: number): { throttle: number; brake: number } {
  const error = desiredSpeed - currentSpeed;
  return error >= 0
    ? { throttle: Math.min(1, error * throttleGain), brake: 0 }
    : { throttle: 0, brake: Math.min(1, -error * brakeGain) };
}

export function safeFollowingDistance(speed: number, baseDistance: number, timeSeconds: number): number {
  return baseDistance + Math.max(0, speed) * timeSeconds;
}

export function followingDesiredSpeed(
  desiredSpeed: number,
  frontSpeed: number | undefined,
  gap: number | undefined,
  safeDistance: number
): number {
  if (frontSpeed === undefined || gap === undefined || gap >= safeDistance) return desiredSpeed;
  const ratio = Math.max(0, gap / Math.max(safeDistance, Number.EPSILON));
  return Math.min(desiredSpeed, frontSpeed * ratio);
}

export function chooseOutgoingLane(
  currentLaneId: string,
  connections: readonly LaneConnection[],
  seed: number
): string | undefined {
  const options = connections.filter((connection) => connection.incomingLaneId === currentLaneId)
    .sort((left, right) => left.outgoingLaneId.localeCompare(right.outgoingLaneId));
  if (options.length === 0) return undefined;
  return options[seed % options.length]?.outgoingLaneId;
}

export function shouldBeActive(distance: number, activeRadius: number, despawnRadius: number, wasActive: boolean): boolean {
  return wasActive ? distance <= despawnRadius : distance <= activeRadius;
}
