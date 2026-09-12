import type { PedestrianNode } from '../city/UrbanMobility';
export interface NpcRoutePoint { readonly position: { x: number; z: number }; readonly nodeId: string; readonly pathIndex: number }

/** A small quadratic fillet stays within the union of the two authored walking corridors. */
export function smoothPedestrianRoute(nodes: readonly PedestrianNode[], radius: number): NpcRoutePoint[] {
  const points: NpcRoutePoint[] = [];
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i]!; const previous = nodes[i - 1]; const next = nodes[i + 1];
    if (!previous || !next) { points.push({ position: node.position, nodeId: node.id, pathIndex: i }); continue; }
    const a = previous.position; const b = node.position; const c = next.position;
    const inLength = Math.hypot(b.x - a.x, b.z - a.z); const outLength = Math.hypot(c.x - b.x, c.z - b.z);
    if (inLength < .001 || outLength < .001) { points.push({ position: b, nodeId: node.id, pathIndex: i }); continue; }
    const r = Math.min(radius, inLength * .25, outLength * .25);
    const entry = { x: b.x - (b.x - a.x) * r / inLength, z: b.z - (b.z - a.z) * r / inLength };
    const exit = { x: b.x + (c.x - b.x) * r / outLength, z: b.z + (c.z - b.z) * r / outLength };
    for (let sample = 0; sample <= 8; sample++) {
      const t = sample / 8; const u = 1 - t;
      points.push({ position: { x: u * u * entry.x + 2 * u * t * b.x + t * t * exit.x, z: u * u * entry.z + 2 * u * t * b.z + t * t * exit.z }, nodeId: sample === 8 ? node.id : previous.id, pathIndex: sample === 8 ? i : i - 1 });
    }
  }
  return points;
}
