import type { GameConfig } from '../core/Config';
import type { LaneConnection, PedestrianCrossing, UrbanMobilityNetwork, VehicleLane } from '../city/UrbanMobility';
import type { RoadPoint } from '../city/CityTypes';
import type { NpcState } from '../npc/NpcTypes';
import { hashStringToSeed } from '../world/SeededNoise';
import { laneLength, laneYaw } from './TrafficLogic';
import { projectPath, samplePath } from './TrafficPath';

export type SignalColor = 'green' | 'yellow' | 'red';
export type TrafficRuleConfig = GameConfig['traffic']['rules'];
export type PedestrianQuery = (point: RoadPoint, radius: number) => readonly NpcState[];
export interface SignalApproach {
  readonly id: string;
  readonly intersectionId: string;
  readonly laneIds: readonly string[];
  readonly phaseIndex: number;
  readonly phaseCount: number;
  readonly phaseOffset: number;
  readonly yaw: number;
  readonly position: RoadPoint;
}
export interface LaneRule {
  readonly intersectionId: string;
  readonly stopDistance: number; // Lane endpoint -> painted line (not chassis centre).
  readonly stopPoint: RoadPoint;
  readonly approach?: SignalApproach;
}

/** One incoming bearing at a time; the existing reservation serializes its lane movements. */
export function signalColor(approach: SignalApproach, seconds: number, config: TrafficRuleConfig): SignalColor {
  const slot = config.greenDuration + config.yellowDuration + config.allRedDuration;
  const cycle = slot * approach.phaseCount;
  const phase = ((seconds + approach.phaseOffset) % cycle + cycle) % cycle;
  if (Math.floor(phase / slot) !== approach.phaseIndex) return 'red';
  const local = phase % slot;
  return local < config.greenDuration ? 'green' : local < config.greenDuration + config.yellowDuration ? 'yellow' : 'red';
}

export function mustStopAtSignal(color: SignalColor, speed: number, gap: number, deceleration: number): boolean {
  if (color === 'green') return false;
  if (color === 'red') return true;
  // Yellow dilemma zone: don't demand an impossible abrupt stop.
  return gap > speed * speed / (2 * deceleration) + Math.max(0, speed) * .3;
}

export function stoppingSpeed(gap: number, deceleration: number): number {
  return gap <= .1 ? 0 : Math.sqrt(2 * deceleration * gap);
}
export function movementPriority(lane: VehicleLane, turn: LaneConnection['turn']): number {
  return ({ local: 0, collector: 1, arterial: 2 }[lane.roadClass]) * 10 + (turn === 'straight' ? 2 : turn === 'right' ? 1 : 0);
}

/** Feet on the crossing always yield; distant sidewalk walkers do not. */
export function pedestrianBlocksCrossing(npc: NpcState, crossing: PedestrianCrossing, config: TrafficRuleConfig): boolean {
  if (npc.tier !== 'active') return false;
  const projection = projectPath([crossing.start, crossing.end], npc.position);
  const length = Math.hypot(crossing.end.x - crossing.start.x, crossing.end.z - crossing.start.z);
  if (projection.distance > .25 && projection.distance < length - .25 && projection.lateralError < config.crossingWidth / 2 + .3) return true;
  if (npc.activity !== 'walking') return false;
  // pathIndex is the last reached waypoint; inspect current/next edges for near-entry intent.
  for (let i = npc.pathIndex; i < Math.min(npc.pathIndex + 3, npc.pathNodeIds.length - 1); i++) {
    const a = npc.pathNodeIds[i]; const b = npc.pathNodeIds[i + 1];
    if ((a === crossing.startNodeId && b === crossing.endNodeId) || (a === crossing.endNodeId && b === crossing.startNodeId)) {
      const entry = a === crossing.startNodeId ? crossing.start : crossing.end;
      return Math.hypot(npc.position.x - entry.x, npc.position.z - entry.z) <= config.pedestrianIntentDistance;
    }
  }
  return false;
}

/** Regeneratable, renderer-independent index. Rebuilt only when the bounded mobility network changes. */
export class TrafficRuleNetwork {
  public readonly laneRules = new Map<string, LaneRule>();
  public readonly approaches: SignalApproach[] = [];
  private readonly crossingsByRoad = new Map<string, PedestrianCrossing[]>();
  public constructor(network: UrbanMobilityNetwork, seed: string, config: TrafficRuleConfig, fallbackStopDistance: number) {
    const lanes = new Map(network.lanes.map((lane) => [lane.id, lane]));
    for (const crossing of network.crossings) {
      const list = this.crossingsByRoad.get(crossing.roadId) ?? []; list.push(crossing); this.crossingsByRoad.set(crossing.roadId, list);
    }
    for (const intersection of network.intersections) {
      const groups = new Map<number, VehicleLane[]>();
      const incoming = intersection.incomingLaneIds.flatMap((id) => lanes.get(id) ? [lanes.get(id)!] : []);
      for (const lane of incoming) {
        const bearing = Math.round(laneYaw(lane) * 180 / Math.PI); const group = groups.get(bearing) ?? [];
        group.push(lane); groups.set(bearing, group);
      }
      const bearings = [...groups.keys()].sort((a, b) => a - b);
      const signalized = bearings.length >= 3 && incoming.some((lane) => lane.roadClass === 'arterial');
      for (const [phaseIndex, bearing] of bearings.entries()) {
        const group = groups.get(bearing)!.sort((a, b) => a.id.localeCompare(b.id));
        const first = group[0]!; const yaw = laneYaw(first);
        const crossing = this.crossingsByRoad.get(first.roadId)?.find((c) => c.intersectionId === intersection.id);
        const crossingCenter = crossing ? { x: (crossing.start.x + crossing.end.x) / 2, z: (crossing.start.z + crossing.end.z) / 2 } : undefined;
        const stopDistance = crossingCenter
          ? laneLength(first) - projectPath(first.path, crossingCenter).distance + config.crossingWidth / 2 + config.stopPadding
          : fallbackStopDistance;
        const phaseOffset = (hashStringToSeed(`${seed}:signal:${intersection.id}`) % 10000) / 10000 * bearings.length * (config.greenDuration + config.yellowDuration + config.allRedDuration);
        const outerLane = [...group].sort((a, b) => b.laneIndex - a.laneIndex)[0]!;
        const outerStop = samplePath(outerLane.path, laneLength(outerLane) - stopDistance);
        const approach: SignalApproach | undefined = signalized ? {
          id: `signal:${intersection.id}:${bearing}`, intersectionId: intersection.id, laneIds: group.map((lane) => lane.id),
          phaseIndex, phaseCount: bearings.length, phaseOffset, yaw,
          position: { x: outerStop.x + Math.cos(yaw) * (config.laneWidth / 2 + .9), z: outerStop.z - Math.sin(yaw) * (config.laneWidth / 2 + .9) }
        } : undefined;
        if (approach) this.approaches.push(approach);
        for (const lane of group) this.laneRules.set(lane.id, { intersectionId: intersection.id, stopDistance, stopPoint: samplePath(lane.path, laneLength(lane) - stopDistance), approach });
      }
    }
  }
  public crossingsFor(lane: VehicleLane): readonly PedestrianCrossing[] { return this.crossingsByRoad.get(lane.roadId) ?? []; }
}
