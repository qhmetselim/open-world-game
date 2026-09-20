export interface HealthState { current: number; maximum: number }
export const createHealth = (maximum = 100): HealthState => ({ current: maximum, maximum });
/** Returns actual damage, never healing or duplicate lethal damage. */
export function applyDamage(health: HealthState, damage: number): number {
  if (!Number.isFinite(damage) || damage <= 0) return 0;
  const applied = Math.min(health.current, damage);
  health.current -= applied;
  return applied;
}
