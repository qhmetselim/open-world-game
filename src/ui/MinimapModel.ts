/** World-source independent UI contract: authored polylines and plain world positions. */
export interface MapPoint { readonly x:number; readonly z:number }
export interface MapLine { readonly id:string; readonly path:readonly MapPoint[] }
export interface MapPoliceMarker {
  readonly id:string; readonly kind:'car'|'officer'; readonly position:MapPoint;
  readonly forward:MapPoint; readonly mode:'search'|'chase';
}
export interface MinimapSnapshot {
  readonly position:MapPoint; readonly forward:MapPoint; readonly lines:readonly MapLine[];
  readonly police:readonly MapPoliceMarker[]; readonly wanted:number; readonly searching:boolean;
  readonly lastKnown:MapPoint;
}
export const minimapConfig={size:200,radius:150,refreshSeconds:.1,searchRadius:35} as const;
/** North is -Z; east is +X. Never derive positions from screen/camera transforms. */
export function mapPoint(point:MapPoint,center:MapPoint,radius:number=minimapConfig.radius):{x:number;y:number} {
  const scale=minimapConfig.size/(radius*2);
  return {x:minimapConfig.size/2+(point.x-center.x)*scale,y:minimapConfig.size/2+(point.z-center.z)*scale};
}
export function mapHeading(forward:MapPoint):number{return Math.atan2(forward.x,-forward.z)*180/Math.PI;}
export function mapRoadPath(lines:readonly MapLine[],center:MapPoint):string {
  const r=minimapConfig.radius;
  const commands:string[]=[];
  for(const line of lines)for(let i=1;i<line.path.length;i++) {
    const a=line.path[i-1]!,b=line.path[i]!;
    if(Math.min(a.x,b.x)>center.x+r||Math.max(a.x,b.x)<center.x-r||Math.min(a.z,b.z)>center.z+r||Math.max(a.z,b.z)<center.z-r)continue;
    const start=mapPoint(a,center),end=mapPoint(b,center);
    commands.push(`M${start.x.toFixed(1)},${start.y.toFixed(1)}L${end.x.toFixed(1)},${end.y.toFixed(1)}`);
  }
  return commands.join('');
}
