import type { CityRegionLayout, RoadNode } from './CityTypes';
import type { UrbanMobilityNetwork } from './UrbanMobility';

/** Finite generation-window audit. Frontier exits are explicit, never counted as broken links. */
export function validateRoadNetwork(layouts: readonly CityRegionLayout[], network: UrbanMobilityNetwork) {
  const roads = new Map(layouts.flatMap((layout) => layout.segments.map((road) => [road.id, road] as const)));
  const nodes = new Map<string, RoadNode>(layouts.flatMap((layout) => layout.nodes.map((node) => [node.id, node] as const)));
  const neighbors = new Map<string, Set<string>>();
  let invalidEndpointCount = 0;
  for (const road of roads.values()) {
    if (!nodes.has(road.startNodeId) || !nodes.has(road.endNodeId) || road.startNodeId === road.endNodeId) { invalidEndpointCount++; continue; }
    for (const [a, b] of [[road.startNodeId, road.endNodeId], [road.endNodeId, road.startNodeId]]) {
      if (a === undefined || b === undefined) continue;
      const set = neighbors.get(a) ?? new Set<string>(); set.add(b); neighbors.set(a, set);
    }
  }
  let connectedComponentCount = 0; const visited = new Set<string>();
  for (const id of neighbors.keys()) {
    if (visited.has(id)) continue;
    connectedComponentCount++;
    const stack = [id];
    while (stack.length > 0) { const next = stack.pop(); if (next === undefined || visited.has(next)) continue; visited.add(next); stack.push(...(neighbors.get(next) ?? [])); }
  }
  const degreeOne = [...neighbors.keys()].filter((id) => neighbors.get(id)?.size === 1);
  const boundary = degreeOne.filter((id) => nodes.get(id)?.terminalReason === 'regionBoundary');
  const intentional = degreeOne.filter((id) => nodes.get(id)?.terminalReason === 'culDeSac');
  const lanes = new Map(network.lanes.map((lane) => [lane.id, lane]));
  const exits = new Set(network.laneConnections.map((connection) => connection.incomingLaneId));
  const entries = new Set(network.laneConnections.map((connection) => connection.outgoingLaneId));
  const isTerminal = (id: string) => boundary.includes(id) || intentional.includes(id);
  const disconnectedLaneCount = network.lanes.filter((lane) => !exits.has(lane.id) && !isTerminal(lane.endNodeId)).length;
  const unreachableLaneCount = network.lanes.filter((lane) => !entries.has(lane.id) && !isTerminal(lane.startNodeId)).length;
  const invalidIntersectionConnections = network.laneConnections.filter((connection) => {
    const from = lanes.get(connection.incomingLaneId); const to = lanes.get(connection.outgoingLaneId);
    return from === undefined || to === undefined || from.roadId === to.roadId || from.endNodeId !== to.startNodeId;
  }).length;
  // A region edge inside the audited rectangle must connect on both sides.
  const minX = Math.min(...[...nodes.values()].map((n) => n.x));
  const maxX = Math.max(...[...nodes.values()].map((n) => n.x));
  const minZ = Math.min(...[...nodes.values()].map((n) => n.z));
  const maxZ = Math.max(...[...nodes.values()].map((n) => n.z));
  const crossBoundaryFailures = boundary.filter((id) => { const n = nodes.get(id); return n !== undefined && n.x > minX && n.x < maxX && n.z > minZ && n.z < maxZ; }).length;
  return {
    roadSegmentCount: roads.size, connectedComponentCount, invalidEndpointCount,
    orphanRoadCount: [...roads.values()].filter((r) => neighbors.get(r.startNodeId)?.size === 1 && neighbors.get(r.endNodeId)?.size === 1).length,
    intentionalDeadEndCount: intentional.length, frontierCount: boundary.length,
    unexpectedDeadEndCount: degreeOne.length - intentional.length - boundary.length,
    disconnectedLaneCount, unreachableLaneCount, invalidIntersectionConnections, crossBoundaryFailures
  };
}
