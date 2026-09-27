import type { CombatPoint } from '../combat/CombatState';
import { hashStringToSeed } from '../world/SeededNoise';
import { policeConfig } from './PoliceConfig';

/** A sampled, stale aim point plus deterministic cone error. The resulting ray is
 * immutable for the shot; movement after acquisition is never homing correction. */
export function policeShotDirection(origin: CombatPoint, aimPoint: CombatPoint, targetSpeed: number,
  level: number, id: string, shot: number): CombatPoint {
  const dx=aimPoint.x-origin.x,dy=aimPoint.y-origin.y,dz=aimPoint.z-origin.z;
  const distance=Math.hypot(dx,dy,dz)||1, horizontal=Math.hypot(dx,dz)||1;
  const spread=(policeConfig.aim.baseSpread+distance*policeConfig.aim.distanceSpread
    +Math.min(6,targetSpeed)*policeConfig.aim.movingSpread)*(policeConfig.spreadByLevel[level]??1);
  const angle=hashStringToSeed(`${id}:${shot}:angle`)/0xffffffff*Math.PI*2;
  const radius=Math.sqrt(hashStringToSeed(`${id}:${shot}:radius`)/0xffffffff)*spread;
  const right=Math.cos(angle)*radius,up=Math.sin(angle)*radius;
  const x=dx/distance+dz/horizontal*right, y=dy/distance+up, z=dz/distance-dx/horizontal*right;
  const length=Math.hypot(x,y,z);
  return {x:x/length,y:y/length,z:z/length};
}
