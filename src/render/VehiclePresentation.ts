import type { PlayerState, PlayerVector3 } from '../player/PlayerState';
import type { VehicleState } from '../vehicle/VehicleState';

const smooth = (n: number): number => { const t = Math.max(0, Math.min(1, n)); return t*t*(3-2*t); };
const mix = (a: PlayerVector3, b: PlayerVector3, t: number): PlayerVector3 => ({ x:a.x+(b.x-a.x)*t, y:a.y+(b.y-a.y)*t, z:a.z+(b.z-a.z)*t });
/** Bounded render-time presentation. The existing atomic enter/safe-exit operation
 * remains authoritative; controls are briefly gated, never a second physics body. */
export class VehiclePresentation {
  public elapsed = 0;
  public readonly duration = 1.65;
  public readonly side: -1 | 1;
  public constructor(public readonly entering: boolean, private readonly outside: PlayerState, vehicle: VehicleState) {
    const dx=outside.position.x-vehicle.position.x, dz=outside.position.z-vehicle.position.z;
    this.side = dx*Math.cos(vehicle.yaw)-dz*Math.sin(vehicle.yaw) < 0 ? -1 : 1;
  }
  public advance(dt: number): void { this.elapsed = Math.min(this.duration, this.elapsed+Math.max(0,dt)); }
  public get done(): boolean { return this.elapsed >= this.duration; }
  public sample(vehicle: VehicleState): { player: PlayerState; door: number; seated: number; visible: boolean } {
    const p=this.elapsed/this.duration;
    const t=this.entering?p:1-p;
    const world=(x:number,y:number,z:number):PlayerVector3=>({x:vehicle.position.x+x*Math.cos(vehicle.yaw)+z*Math.sin(vehicle.yaw),y,z:vehicle.position.z-x*Math.sin(vehicle.yaw)+z*Math.cos(vehicle.yaw)});
    const outside=this.outside.position;
    const threshold=world(this.side*1.28,outside.y,.28);
    const seat=world(this.side*.38,vehicle.position.y+.18,.15);
    const approach=smooth(t/.28), seating=smooth((t-.42)/.38);
    const dx=outside.x-vehicle.position.x, dz=outside.z-vehicle.position.z;
    const lateral=dx*Math.cos(vehicle.yaw)-dz*Math.sin(vehicle.yaw);
    const longitudinal=dx*Math.sin(vehicle.yaw)+dz*Math.cos(vehicle.yaw);
    // Front/rear approaches go around the body before walking down its side;
    // a straight diagonal would visually pass through the hood or trunk.
    const corner=world(this.side*1.28,outside.y,longitudinal);
    const useCorner=Math.abs(lateral)<1.28 && Math.abs(longitudinal)>.88;
    const approached=useCorner
      ? approach<.5?mix(outside,corner,smooth(approach*2)):mix(corner,threshold,smooth(approach*2-1))
      : mix(outside,threshold,approach);
    const position=mix(approached,seat,seating);
    const vehicleFacing=Math.PI-vehicle.yaw;
    const facing=vehicleFacing+this.side*Math.PI/2*(1-seating);
    const delta=Math.atan2(Math.sin(facing-this.outside.facingYaw),Math.cos(facing-this.outside.facingYaw));
    const door=smooth((t-.18)/.20)*(1-smooth((t-.80)/.20));
    const speed=t>0 && t<.28 ? Math.hypot(threshold.x-outside.x,threshold.z-outside.z)/(.28*this.duration) : 0;
    return {player:{...this.outside,position,velocity:{x:Math.min(speed,4),y:0,z:0},facingYaw:this.outside.facingYaw+delta*approach},door,seated:seating,visible:t<.83};
  }
}
