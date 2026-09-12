import type { VehicleLane } from '../city/UrbanMobility';
import type { GameConfig } from '../core/Config';
import type { PhysicsWorld } from '../physics/PhysicsWorld';
import { laneLength, lanePointAtProgress, laneYaw } from './TrafficLogic';

export type TrafficRoadValidation = (lane: VehicleLane, x: number, z: number) => boolean;
export function validateTrafficSpawn(lane: VehicleLane, progress: number, physics: PhysicsWorld, sedan: GameConfig['vehicle']['sedan'], config: GameConfig['traffic'], height: (x: number, z: number) => number, roadValid: TrafficRoadValidation) {
  const length = laneLength(lane);
  if (!Number.isFinite(length) || length < 2 * config.spawnEndpointMargin || !Number.isFinite(progress)
    || progress * length < config.spawnEndpointMargin || (1 - progress) * length < config.spawnEndpointMargin) return undefined;
  const point = lanePointAtProgress(lane, progress); const yaw = laneYaw(lane);
  if (!Number.isFinite(yaw) || !roadValid(lane, point.x, point.z)) return undefined;
  const heights: number[] = [];
  for (const x of [-sedan.trackWidth / 2, sedan.trackWidth / 2]) for (const z of [-sedan.wheelBase / 2, sedan.wheelBase / 2]) {
    const wx = point.x + Math.cos(yaw) * x + Math.sin(yaw) * z;
    const wz = point.z - Math.sin(yaw) * x + Math.cos(yaw) * z;
    const expected = height(wx, wz);
    if (!Number.isFinite(expected) || !roadValid(lane, wx, wz)) return undefined;
    const ground = physics.groundHeight(wx, wz, expected);
    if (ground === undefined || Math.abs(ground - expected) > .3) return undefined;
    heights.push(ground);
  }
  if (Math.max(...heights) - Math.min(...heights) > config.maxSpawnGrade * sedan.wheelBase) return undefined;
  const y = Math.max(...heights) + sedan.chassisHeight / 2 + sedan.wheelRadius + sedan.suspensionRestLength - .1;
  const position = { ...point, y };
  return physics.isVehiclePositionClear(position, yaw, sedan) ? { position, yaw } : undefined;
}
