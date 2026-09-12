import type { RoadPoint } from '../city/CityTypes';
import type { VehicleLane } from '../city/UrbanMobility';
import { laneLength, lanePointAtProgress } from './TrafficLogic';

export interface PathProjection { distance: number; lateralError: number; point: RoadPoint }
export function pathLength(path: readonly RoadPoint[]): number {
  let length = 0;
  for (let i = 1; i < path.length; i++) { const a = path[i - 1]; const b = path[i]; if (a && b) length += Math.hypot(b.x - a.x, b.z - a.z); }
  return length;
}
export function samplePath(path: readonly RoadPoint[], distance: number): RoadPoint {
  let remaining = Math.max(0, distance);
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]; const b = path[i]; if (!a || !b) continue;
    const length = Math.hypot(b.x - a.x, b.z - a.z);
    if (remaining <= length && length > 1e-8) { const t = remaining / length; return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t }; }
    remaining -= length;
  }
  return path.at(-1) ?? { x: 0, z: 0 };
}
export function projectPath(path: readonly RoadPoint[], point: RoadPoint): PathProjection {
  let along = 0; let best: PathProjection = { distance: 0, lateralError: Infinity, point: path[0] ?? point };
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]; const b = path[i]; if (!a || !b) continue;
    const dx = b.x - a.x; const dz = b.z - a.z; const length = Math.hypot(dx, dz);
    const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.z - a.z) * dz) / Math.max(length * length, 1e-9)));
    const projected = { x: a.x + t * dx, z: a.z + t * dz };
    const error = Math.hypot(point.x - projected.x, point.z - projected.z);
    if (error < best.lateralError) best = { distance: along + t * length, lateralError: error, point: projected };
    along += length;
  }
  return best;
}

/** Recovery may rejoin a nearby connected, forward-facing lane, never the opposing carriageway. */
export function reacquireForwardLane(lanes: readonly VehicleLane[], position: RoadPoint, yaw: number, maxDistance = 2): VehicleLane | undefined {
  return lanes.map((lane) => ({ lane, projection: projectPath(lane.path, position) }))
    .filter(({ lane, projection }) => {
      const ahead = samplePath(lane.path, projection.distance + 4);
      const dx = ahead.x - position.x; const dz = ahead.z - position.z;
      const length = Math.hypot(dx, dz);
      return projection.lateralError <= maxDistance && length > 1
        && (dx * Math.sin(yaw) + dz * Math.cos(yaw)) / length > .7;
    })
    .sort((a, b) => a.projection.lateralError - b.projection.lateralError || a.lane.id.localeCompare(b.lane.id))[0]?.lane;
}

/** Tangents make the junction a continuous driving path, without rigid-body snapping. */
export function buildTrafficPath(lane: VehicleLane, next: VehicleLane | undefined, radius: number): readonly RoadPoint[] {
  if (!next) return lane.path;
  const inLength = laneLength(lane); const outLength = laneLength(next);
  const approach = Math.min(radius, inLength * .4, outLength * .4);
  const a = lanePointAtProgress(lane, 1 - approach / inLength);
  const b = lanePointAtProgress(next, approach / outLength);
  const inEnd = lane.path.at(-1)!; const outStart = next.path[0]!;
  const points: RoadPoint[] = [lane.path[0]!, a];
  for (let i = 1; i <= 16; i++) {
    const t = i / 16; const u = 1 - t;
    points.push({ x: u ** 3 * a.x + 3 * u * u * t * inEnd.x + 3 * u * t * t * outStart.x + t ** 3 * b.x,
      z: u ** 3 * a.z + 3 * u * u * t * inEnd.z + 3 * u * t * t * outStart.z + t ** 3 * b.z });
  }
  return points;
}

/** +Z is chassis-forward and +X is right. A target behind requires braking/reacquisition. */
export function pursuitSteering(yaw: number, position: RoadPoint, target: RoadPoint, wheelBase: number, limit: number): { steering: number; behind: boolean } {
  const dx = target.x - position.x; const dz = target.z - position.z;
  const forward = dx * Math.sin(yaw) + dz * Math.cos(yaw);
  const right = dx * Math.cos(yaw) - dz * Math.sin(yaw);
  const angle = Math.atan2(2 * wheelBase * right, Math.max(dx * dx + dz * dz, .01));
  return { steering: Math.max(-limit, Math.min(limit, angle)), behind: forward < -1 };
}
