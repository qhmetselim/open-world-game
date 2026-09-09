import type { PedestrianConnection, PedestrianNode } from '../city/UrbanMobility';

export function findPedestrianPath(
  startId: string,
  goalId: string,
  nodes: readonly PedestrianNode[],
  connections: readonly PedestrianConnection[],
  maxVisited = 512
): readonly string[] | undefined {
  if (startId === goalId) return [startId];
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  if (!nodeById.has(startId) || !nodeById.has(goalId)) return undefined;
  const adjacency = new Map<string, string[]>();
  for (const connection of connections) {
    add(adjacency, connection.fromNodeId, connection.toNodeId);
    add(adjacency, connection.toNodeId, connection.fromNodeId);
  }
  const open = new Set([startId]);
  const cameFrom = new Map<string, string>();
  const cost = new Map([[startId, 0]]);
  const goal = nodeById.get(goalId);
  if (goal === undefined) return undefined;
  let visited = 0;
  while (open.size > 0 && visited < maxVisited) {
    const current = [...open].sort((left, right) => score(left, cost, nodeById, goal) - score(right, cost, nodeById, goal) || left.localeCompare(right))[0];
    if (current === undefined) break;
    if (current === goalId) return reconstruct(cameFrom, current);
    open.delete(current);
    visited += 1;
    const currentNode = nodeById.get(current);
    if (currentNode === undefined) continue;
    for (const neighbor of (adjacency.get(current) ?? []).sort()) {
      const neighborNode = nodeById.get(neighbor);
      if (neighborNode === undefined) continue;
      const tentative = (cost.get(current) ?? Number.POSITIVE_INFINITY) + Math.hypot(currentNode.position.x - neighborNode.position.x, currentNode.position.z - neighborNode.position.z);
      if (tentative >= (cost.get(neighbor) ?? Number.POSITIVE_INFINITY)) continue;
      cameFrom.set(neighbor, current);
      cost.set(neighbor, tentative);
      open.add(neighbor);
    }
  }
  return undefined;
}

function add(map: Map<string, string[]>, from: string, to: string): void { const values = map.get(from) ?? []; values.push(to); map.set(from, values); }
function score(id: string, cost: ReadonlyMap<string, number>, nodes: ReadonlyMap<string, PedestrianNode>, goal: PedestrianNode): number {
  const node = nodes.get(id); return (cost.get(id) ?? Number.POSITIVE_INFINITY) + (node === undefined ? Number.POSITIVE_INFINITY : Math.hypot(node.position.x - goal.position.x, node.position.z - goal.position.z));
}
function reconstruct(cameFrom: ReadonlyMap<string, string>, goal: string): readonly string[] {
  const path = [goal]; let current = goal;
  while (cameFrom.has(current)) { current = cameFrom.get(current) as string; path.push(current); }
  return path.reverse();
}
