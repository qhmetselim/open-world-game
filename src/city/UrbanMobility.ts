import type { GameConfig } from '../core/Config';
import { resolveRoadSegment } from './CityTypes';
import type { CityRegionLayout, ResolvedRoadSegment, RoadPoint, RoadType } from './CityTypes';

export type LaneDirection = 'forward' | 'reverse';
export type TurnType = 'straight' | 'left' | 'right';
export type PedestrianConnectionType = 'sidewalk' | 'corner' | 'crossing';

export interface VehicleLane {
  readonly id: string;
  readonly roadId: string;
  readonly direction: LaneDirection;
  readonly laneIndex: number;
  readonly roadClass: RoadType;
  readonly speedMetadata: number;
  readonly startNodeId: string;
  readonly endNodeId: string;
  readonly path: readonly RoadPoint[];
}

export interface IntersectionData {
  readonly id: string;
  readonly nodeId: string;
  readonly position: RoadPoint;
  readonly connectedRoadIds: readonly string[];
  readonly incomingLaneIds: readonly string[];
  readonly outgoingLaneIds: readonly string[];
}

export interface LaneConnection {
  readonly id: string;
  readonly intersectionId: string;
  readonly incomingLaneId: string;
  readonly outgoingLaneId: string;
  readonly turn: TurnType;
}

export interface PedestrianNode {
  readonly id: string;
  readonly position: RoadPoint;
  readonly roadId: string;
  readonly side: 'left' | 'right';
  readonly connectionIds: readonly string[];
}

export interface PedestrianConnection {
  readonly id: string;
  readonly fromNodeId: string;
  readonly toNodeId: string;
  readonly type: PedestrianConnectionType;
  readonly roadId?: string;
  readonly intersectionId?: string;
}

export interface PedestrianCrossing {
  readonly id: string;
  readonly intersectionId: string;
  readonly roadId: string;
  readonly startNodeId: string;
  readonly endNodeId: string;
  readonly start: RoadPoint;
  readonly end: RoadPoint;
}

export interface UrbanMobilityNetwork {
  readonly lanes: readonly VehicleLane[];
  readonly intersections: readonly IntersectionData[];
  readonly laneConnections: readonly LaneConnection[];
  readonly pedestrianNodes: readonly PedestrianNode[];
  readonly pedestrianConnections: readonly PedestrianConnection[];
  readonly crossings: readonly PedestrianCrossing[];
}

export interface NearestLaneResult {
  readonly lane: VehicleLane;
  readonly point: RoadPoint;
  readonly distance: number;
  readonly tangent: RoadPoint;
}

export interface NearestPedestrianNodeResult {
  readonly node: PedestrianNode;
  readonly distance: number;
}

interface ResolvedRoad extends ResolvedRoadSegment {
  readonly type: RoadType;
}

export function buildUrbanMobilityNetwork(
  layouts: readonly CityRegionLayout[],
  config: GameConfig['city']['mobility']
): UrbanMobilityNetwork {
  const roads = resolveUniqueRoads(layouts);
  const lanes = roads.flatMap((road) => buildRoadLanes(road, config));
  const roadsAtNode = collectRoadsAtNode(roads);
  const laneAtNode = collectLanesAtNode(lanes);
  const intersections = buildIntersections(roadsAtNode, laneAtNode);
  const laneConnections = buildLaneConnections(intersections, roadsAtNode, laneAtNode, lanes);
  const pedestrian = buildPedestrianNetwork(roads, intersections, config);
  return {
    lanes: lanes.sort(byId),
    intersections: intersections.sort(byId),
    laneConnections: laneConnections.sort(byId),
    pedestrianNodes: pedestrian.nodes.sort(byId),
    pedestrianConnections: pedestrian.connections.sort(byId),
    crossings: pedestrian.crossings.sort(byId)
  };
}

export function buildRoadLanes(road: ResolvedRoad, config: GameConfig['city']['mobility']): VehicleLane[] {
  const profile = config[road.type];
  const direction = normalizedDirection(road.start, road.end);
  const leftNormal = { x: -direction.z, z: direction.x };
  const lanes: VehicleLane[] = [];
  for (let index = 0; index < profile.lanesPerDirection; index += 1) {
    const offset = (index + 0.5) * config.laneWidth;
    lanes.push(createLane(road, 'forward', index, -offset, leftNormal, profile.speedMetadata));
    lanes.push(createLane(road, 'reverse', index, offset, leftNormal, profile.speedMetadata));
  }
  return lanes;
}

export function findNearestLane(position: RoadPoint, lanes: readonly VehicleLane[]): NearestLaneResult | undefined {
  let nearest: NearestLaneResult | undefined;
  for (const lane of lanes) {
    const start = lane.path[0];
    const end = lane.path.at(-1);
    if (start === undefined || end === undefined) continue;
    const projection = projectPointToSegment(position, start, end);
    if (nearest === undefined || projection.distance < nearest.distance || (projection.distance === nearest.distance && lane.id < nearest.lane.id)) {
      nearest = { lane, point: projection.point, distance: projection.distance, tangent: normalizedDirection(start, end) };
    }
  }
  return nearest;
}

export function findNearestPedestrianNode(position: RoadPoint, nodes: readonly PedestrianNode[]): NearestPedestrianNodeResult | undefined {
  let nearest: NearestPedestrianNodeResult | undefined;
  for (const node of nodes) {
    const distance = Math.hypot(node.position.x - position.x, node.position.z - position.z);
    if (nearest === undefined || distance < nearest.distance || (distance === nearest.distance && node.id < nearest.node.id)) {
      nearest = { node, distance };
    }
  }
  return nearest;
}

function resolveUniqueRoads(layouts: readonly CityRegionLayout[]): ResolvedRoad[] {
  const roads = new Map<string, ResolvedRoad>();
  for (const layout of layouts) {
    const nodes = new Map(layout.nodes.map((node) => [node.id, node]));
    for (const segment of layout.segments) roads.set(segment.id, resolveRoadSegment(segment, nodes));
  }
  return [...roads.values()].sort(byId);
}

function createLane(
  road: ResolvedRoad,
  direction: LaneDirection,
  laneIndex: number,
  offset: number,
  leftNormal: RoadPoint,
  speedMetadata: number
): VehicleLane {
  const start = offsetPoint(road.start, leftNormal, offset);
  const end = offsetPoint(road.end, leftNormal, offset);
  const forward = direction === 'forward';
  return {
    id: `lane:${road.id}:${direction}:${laneIndex}`,
    roadId: road.id,
    direction,
    laneIndex,
    roadClass: road.type,
    speedMetadata,
    startNodeId: forward ? road.startNodeId : road.endNodeId,
    endNodeId: forward ? road.endNodeId : road.startNodeId,
    path: forward ? [start, end] : [end, start]
  };
}

function collectRoadsAtNode(roads: readonly ResolvedRoad[]): Map<string, ResolvedRoad[]> {
  const result = new Map<string, ResolvedRoad[]>();
  for (const road of roads) {
    addToList(result, road.startNodeId, road);
    addToList(result, road.endNodeId, road);
  }
  return result;
}

function collectLanesAtNode(lanes: readonly VehicleLane[]): Map<string, VehicleLane[]> {
  const result = new Map<string, VehicleLane[]>();
  for (const lane of lanes) {
    addToList(result, lane.startNodeId, lane);
    addToList(result, lane.endNodeId, lane);
  }
  return result;
}

function buildIntersections(roadsAtNode: ReadonlyMap<string, readonly ResolvedRoad[]>, lanesAtNode: ReadonlyMap<string, readonly VehicleLane[]>): IntersectionData[] {
  const intersections: IntersectionData[] = [];
  for (const [nodeId, roads] of roadsAtNode) {
    if (roads.length < 3) continue;
    const position = roads.find((road) => road.startNodeId === nodeId)?.start ?? roads[0]?.end;
    if (position === undefined) continue;
    const lanes = lanesAtNode.get(nodeId) ?? [];
    intersections.push({
      id: `intersection:${nodeId}`,
      nodeId,
      position,
      connectedRoadIds: [...new Set(roads.map((road) => road.id))].sort(),
      incomingLaneIds: lanes.filter((lane) => lane.endNodeId === nodeId).map((lane) => lane.id).sort(),
      outgoingLaneIds: lanes.filter((lane) => lane.startNodeId === nodeId).map((lane) => lane.id).sort()
    });
  }
  return intersections;
}

function buildLaneConnections(
  intersections: readonly IntersectionData[],
  roadsAtNode: ReadonlyMap<string, readonly ResolvedRoad[]>,
  lanesAtNode: ReadonlyMap<string, readonly VehicleLane[]>,
  lanes: readonly VehicleLane[]
): LaneConnection[] {
  const lanesById = new Map(lanes.map((lane) => [lane.id, lane]));
  const intersectionByNode = new Map(intersections.map((intersection) => [intersection.nodeId, intersection]));
  const connections: LaneConnection[] = [];
  for (const [nodeId, roads] of roadsAtNode) {
    if (roads.length < 2) continue;
    const nodeLanes = lanesAtNode.get(nodeId) ?? [];
    const incomingLaneIds = nodeLanes.filter((lane) => lane.endNodeId === nodeId).map((lane) => lane.id);
    const outgoingLaneIds = nodeLanes.filter((lane) => lane.startNodeId === nodeId).map((lane) => lane.id);
    const intersectionId = intersectionByNode.get(nodeId)?.id ?? `lane-junction:${nodeId}`;
    for (const incomingId of incomingLaneIds) {
      const incoming = lanesById.get(incomingId);
      if (incoming === undefined) continue;
      for (const outgoingId of outgoingLaneIds) {
        const outgoing = lanesById.get(outgoingId);
        if (outgoing === undefined || outgoing.roadId === incoming.roadId) continue;
        connections.push({
          id: `lane-connection:${intersectionId}:${incoming.id}>${outgoing.id}`,
          intersectionId,
          incomingLaneId: incoming.id,
          outgoingLaneId: outgoing.id,
          turn: classifyTurn(incoming, outgoing)
        });
      }
    }
  }
  return connections;
}

function buildPedestrianNetwork(
  roads: readonly ResolvedRoad[],
  intersections: readonly IntersectionData[],
  config: GameConfig['city']['mobility']
): { readonly nodes: PedestrianNode[]; readonly connections: PedestrianConnection[]; readonly crossings: PedestrianCrossing[] } {
  const nodes = new Map<string, Omit<PedestrianNode, 'connectionIds'>>();
  const connections: PedestrianConnection[] = [];
  const nodeRoads = new Map<string, ResolvedRoad[]>();
  const junctionTrim = new Map(intersections.map((intersection) => [intersection.nodeId,
    Math.max(...roads.filter((road) => intersection.connectedRoadIds.includes(road.id)).map((road) => road.width)) / 2 + config.crosswalkWidth / 2]));
  for (const road of roads) {
    addToList(nodeRoads, road.startNodeId, road);
    addToList(nodeRoads, road.endNodeId, road);
    const direction = normalizedDirection(road.start, road.end);
    const normal = { x: -direction.z, z: direction.x };
    for (const side of ['left', 'right'] as const) {
      const offset = (road.width / 2 + config.curbWidth + config.sidewalkWidth / 2) * (side === 'left' ? 1 : -1);
      const startId = pedestrianNodeId(road.id, side, road.startNodeId);
      const endId = pedestrianNodeId(road.id, side, road.endNodeId);
      const maximumTrim = Math.hypot(road.end.x - road.start.x, road.end.z - road.start.z) * .4;
      const start = offsetPoint(road.start, direction, Math.min(maximumTrim, junctionTrim.get(road.startNodeId) ?? 0));
      const end = offsetPoint(road.end, direction, -Math.min(maximumTrim, junctionTrim.get(road.endNodeId) ?? 0));
      nodes.set(startId, { id: startId, position: offsetPoint(start, normal, offset), roadId: road.id, side });
      nodes.set(endId, { id: endId, position: offsetPoint(end, normal, offset), roadId: road.id, side });
      connections.push({ id: `ped-edge:${road.id}:${side}`, fromNodeId: startId, toNodeId: endId, type: 'sidewalk', roadId: road.id });
    }
  }
  const crossings: PedestrianCrossing[] = [];
  for (const intersection of intersections) {
    const roadsAtIntersection = nodeRoads.get(intersection.nodeId) ?? [];
    for (const road of roadsAtIntersection) {
      const nodeIsStart = road.startNodeId === intersection.nodeId;
      const leftId = pedestrianNodeId(road.id, 'left', nodeIsStart ? road.startNodeId : road.endNodeId);
      const rightId = pedestrianNodeId(road.id, 'right', nodeIsStart ? road.startNodeId : road.endNodeId);
      const left = nodes.get(leftId);
      const right = nodes.get(rightId);
      if (left === undefined || right === undefined) continue;
      const id = `crossing:${intersection.id}:${road.id}`;
      crossings.push({ id, intersectionId: intersection.id, roadId: road.id, startNodeId: leftId, endNodeId: rightId, start: left.position, end: right.position });
      connections.push({ id: `ped-connection:${id}`, fromNodeId: leftId, toNodeId: rightId, type: 'crossing', roadId: road.id, intersectionId: intersection.id });
    }
  }
  for (const [nodeId, roadsAtNode] of nodeRoads) {
    if (roadsAtNode.length < 2) continue;
    const endpoints = roadsAtNode.flatMap((road) => {
      const endpointId = road.startNodeId === nodeId ? road.startNodeId : road.endNodeId;
      return ['left', 'right'].map((side) => nodes.get(pedestrianNodeId(road.id, side as 'left' | 'right', endpointId))).filter((node): node is Omit<PedestrianNode, 'connectionIds'> => node !== undefined);
    });
    for (let index = 0; index < endpoints.length; index += 1) {
      const from = endpoints[index];
      if (from === undefined) continue;
      let nearest: Omit<PedestrianNode, 'connectionIds'> | undefined;
      let nearestDistance = Number.POSITIVE_INFINITY;
      for (const to of endpoints) {
        if (to.id === from.id || to.roadId === from.roadId) continue;
        const distance = Math.hypot(from.position.x - to.position.x, from.position.z - to.position.z);
        if (distance < nearestDistance || (distance === nearestDistance && (nearest === undefined || to.id < nearest.id))) {
          nearest = to;
          nearestDistance = distance;
        }
      }
      if (nearest === undefined) continue;
      const ids = [from.id, nearest.id].sort();
      const first = ids[0];
      const second = ids[1];
      if (first === undefined || second === undefined) continue;
      connections.push({ id: `ped-corner:${nodeId}:${first}:${second}`, fromNodeId: first, toNodeId: second, type: 'corner', intersectionId: `intersection:${nodeId}` });
    }
  }
  const uniqueConnections = new Map(connections.map((connection) => [connection.id, connection]));
  const connectionIds = new Map<string, string[]>();
  for (const connection of uniqueConnections.values()) {
    addToList(connectionIds, connection.fromNodeId, connection.id);
    addToList(connectionIds, connection.toNodeId, connection.id);
  }
  return {
    nodes: [...nodes.values()].map((node) => ({ ...node, connectionIds: [...new Set(connectionIds.get(node.id) ?? [])].sort() })),
    connections: [...uniqueConnections.values()],
    crossings
  };
}

function classifyTurn(incoming: VehicleLane, outgoing: VehicleLane): TurnType {
  const incomingStart = incoming.path[0];
  const incomingEnd = incoming.path.at(-1);
  const outgoingStart = outgoing.path[0];
  const outgoingEnd = outgoing.path.at(-1);
  if (incomingStart === undefined || incomingEnd === undefined || outgoingStart === undefined || outgoingEnd === undefined) return 'straight';
  const a = normalizedDirection(incomingStart, incomingEnd);
  const b = normalizedDirection(outgoingStart, outgoingEnd);
  if (a.x * b.x + a.z * b.z > 0.7) return 'straight';
  return a.x * b.z - a.z * b.x > 0 ? 'left' : 'right';
}

function pedestrianNodeId(roadId: string, side: 'left' | 'right', nodeId: string): string {
  return `ped:${roadId}:${side}:${nodeId}`;
}

function projectPointToSegment(point: RoadPoint, start: RoadPoint, end: RoadPoint): { readonly point: RoadPoint; readonly distance: number } {
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const lengthSq = dx * dx + dz * dz;
  const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.z - start.z) * dz) / lengthSq));
  const projected = { x: start.x + dx * t, z: start.z + dz * t };
  return { point: projected, distance: Math.hypot(point.x - projected.x, point.z - projected.z) };
}

function normalizedDirection(start: RoadPoint, end: RoadPoint): RoadPoint {
  const length = Math.hypot(end.x - start.x, end.z - start.z);
  return length === 0 ? { x: 0, z: 0 } : { x: (end.x - start.x) / length, z: (end.z - start.z) / length };
}

function offsetPoint(point: RoadPoint, normal: RoadPoint, amount: number): RoadPoint {
  return { x: point.x + normal.x * amount, z: point.z + normal.z * amount };
}

function addToList<T>(map: Map<string, T[]>, key: string, value: T): void {
  const values = map.get(key) ?? [];
  values.push(value);
  map.set(key, values);
}

function byId<T extends { readonly id: string }>(left: T, right: T): number {
  return left.id.localeCompare(right.id);
}
