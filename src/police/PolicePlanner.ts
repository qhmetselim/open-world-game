import type { RoadPoint } from '../city/CityTypes';
import type { UrbanMobilityNetwork } from '../city/UrbanMobility';
import { findNearestLane } from '../city/UrbanMobility';
import { policeConfig } from './PoliceConfig';

/** Bounded rolling BFS over existing allowed lane connections; no off-road chase shortcuts. */
export function nextChaseLane(current:string,target:RoadPoint,network:UrbanMobilityNetwork):string|undefined {
  const goal=findNearestLane(target,network.lanes)?.lane.id;
  const valid=new Set(network.lanes.map(l=>l.id));
  const edges=new Map<string,string[]>();
  for(const connection of network.laneConnections) {
    if(!valid.has(connection.outgoingLaneId))continue;
    const list=edges.get(connection.incomingLaneId)??[];list.push(connection.outgoingLaneId);edges.set(connection.incomingLaneId,list);
  }
  const queue=[current], first=new Map<string,string>(); const visited=new Set(queue);
  for(let i=0;i<queue.length&&i<512;i++) {
    const id=queue[i]!;
    for(const next of (edges.get(id)??[]).sort()) {
      if(visited.has(next))continue;visited.add(next);first.set(next,id===current?next:first.get(id)!);
      if(next===goal)return first.get(next);queue.push(next);
    }
  }
  return edges.get(current)?.sort()[0];
}

export function hiddenResponsePosition(point:RoadPoint, focus:RoadPoint, eye:RoadPoint, view:RoadPoint):boolean {
  const distance=Math.hypot(point.x-focus.x,point.z-focus.z);
  const dx=point.x-eye.x,dz=point.z-eye.z,length=Math.hypot(dx,dz)||1;
  return distance>=policeConfig.spawnMin&&distance<=policeConfig.spawnMax&&(dx*view.x+dz*view.z)/length<-.1;
}

/** Long sidewalk edges may have no endpoint in the response annulus. Sample the
 * authored edge, not arbitrary world positions or occupied crossing centers. */
export function responseFootPoints(network:UrbanMobilityNetwork):{id:string;position:RoadPoint}[] {
  const points=network.pedestrianNodes.map(n=>({id:n.id,position:n.position}));
  const nodes=new Map(network.pedestrianNodes.map(n=>[n.id,n]));
  for(const edge of network.pedestrianConnections) {
    if(edge.type==='crossing')continue;
    const a=nodes.get(edge.fromNodeId)?.position,b=nodes.get(edge.toNodeId)?.position;
    if(!a||!b)continue;
    for(const t of [.25,.5,.75])points.push({id:`${edge.id}:${t}`,position:{x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t}});
  }
  return points;
}
