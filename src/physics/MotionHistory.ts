export interface Position3 { x: number; y: number; z: number }
export interface Rotation4 extends Position3 { w: number }
export interface MotionTransform { position: Position3; rotation: Rotation4 }

/** Render-only history; never written back into a rigid body or gameplay state. */
export class MotionHistory {
  private previous: MotionTransform = { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 } };
  private current: MotionTransform = structuredClone(this.previous);
  public reset(position: Position3, rotation: Rotation4): void {
    this.current = { position: { ...position }, rotation: { ...rotation } };
    this.previous = structuredClone(this.current);
  }
  public capture(position: Position3, rotation: Rotation4): void {
    this.previous = this.current;
    this.current = { position: { ...position }, rotation: { ...rotation } };
  }
  public sample(alpha: number): MotionTransform {
    const t = Math.max(0, Math.min(1, alpha));
    const a = this.previous; const b = this.current;
    return { position: { x: a.position.x + (b.position.x - a.position.x) * t, y: a.position.y + (b.position.y - a.position.y) * t, z: a.position.z + (b.position.z - a.position.z) * t }, rotation: slerpRotation(a.rotation, b.rotation, t) };
  }
}

export function yawRotation(yaw: number): Rotation4 { return { x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) }; }
export function rotationYaw(q: Rotation4): number { return Math.atan2(2 * (q.w * q.y + q.x * q.z), 1 - 2 * (q.y * q.y + q.z * q.z)); }
export function slerpRotation(a: Rotation4, b: Rotation4, t: number): Rotation4 {
  let dot = a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w;
  const sign = dot < 0 ? -1 : 1; dot = Math.min(1, Math.abs(dot));
  const angle = Math.acos(dot); const sine = Math.sin(angle);
  const x = sine < 1e-6 ? 1 - t : Math.sin((1 - t) * angle) / sine;
  const y = (sine < 1e-6 ? t : Math.sin(t * angle) / sine) * sign;
  const q = { x: a.x * x + b.x * y, y: a.y * x + b.y * y, z: a.z * x + b.z * y, w: a.w * x + b.w * y };
  const norm = Math.hypot(q.x, q.y, q.z, q.w);
  return { x: q.x / norm, y: q.y / norm, z: q.z / norm, w: q.w / norm };
}
