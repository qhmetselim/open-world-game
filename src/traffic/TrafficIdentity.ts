import { hashStringToSeed } from '../world/SeededNoise';
import { trafficSpeedMultiplier } from './TrafficLogic';

const palette = [0x5d7184, 0x9b9a91, 0x8b4f4e, 0x536d7c] as const;

export interface TrafficIdentity { readonly id: string; readonly appearanceSeed: number; readonly color: number; readonly speedMultiplier: number; }

export function createTrafficIdentity(worldSeed: string, laneId: string, minSpeed: number, maxSpeed: number): TrafficIdentity {
  const id = `traffic:${laneId}`;
  const appearanceSeed = hashStringToSeed(`${worldSeed}:${id}`);
  return { id, appearanceSeed, color: palette[appearanceSeed % palette.length] ?? palette[0], speedMultiplier: trafficSpeedMultiplier(appearanceSeed, minSpeed, maxSpeed) };
}
