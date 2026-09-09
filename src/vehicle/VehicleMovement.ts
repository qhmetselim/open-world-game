export function metersPerSecondToKmh(speed: number): number { return speed * 3.6; }

/** Gameplay convention: left is negative and right is positive, independent of travel direction. */
export function getSteeringInput(left: boolean, right: boolean): number { return Number(right) - Number(left); }

/** Rapier's configured wheel axle shares the player-facing convention. */
export function toRapierSteeringAngle(steering: number): number { return steering; }

/** The visual front-wheel pivot shares the gameplay convention. */
export function getFrontWheelVisualSteering(steering: number): number { return steering; }
export function getSteeringLimit(speed: number, maxAngle: number, highSpeedReduction: number, maxSpeed: number): number {
  const t = Math.min(Math.abs(speed) / maxSpeed, 1); return maxAngle * (1 - (1 - highSpeedReduction) * t);
}
export function resolveBrakeReverse(speed: number, backward: boolean): { brake: number; reverse: number } {
  if (!backward) return { brake: 0, reverse: 0 }; return speed > 0.6 ? { brake: 1, reverse: 0 } : { brake: 0, reverse: 1 };
}
export function vehicleLookAhead(position: { x:number; z:number }, velocity: { x:number; z:number }, distance: number): { x:number; z:number } {
  const length = Math.hypot(velocity.x, velocity.z); return length > 0.1 ? { x: position.x + velocity.x / length * distance, z: position.z + velocity.z / length * distance } : position;
}
