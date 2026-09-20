import { combatConfig } from './CombatConfig';
import type { WeaponDefinition } from './CombatConfig';
export interface CombatPoint { x: number; y: number; z: number }
export interface CombatState {
  weaponId: string; equipped: boolean; aiming: boolean; magazine: number; reserve: number;
  cooldown: number; reloadRemaining: number; shotsFired: number;
}
export function createCombatState(weapon: WeaponDefinition): CombatState {
  return { weaponId: weapon.id, equipped: false, aiming: false, magazine: weapon.magazineSize, reserve: weapon.reserveAmmo, cooldown: 0, reloadRemaining: 0, shotsFired: 0 };
}
export function stepWeapon(state: CombatState, weapon: WeaponDefinition, dt: number): void {
  state.cooldown = Math.max(0, state.cooldown - dt);
  if (state.reloadRemaining <= 0) return;
  state.reloadRemaining = Math.max(0, state.reloadRemaining - dt);
  if (state.reloadRemaining === 0) {
    const count = Math.min(weapon.magazineSize - state.magazine, state.reserve);
    state.magazine += count; state.reserve -= count;
  }
}
export function beginReload(state: CombatState, weapon: WeaponDefinition): boolean {
  if (!state.equipped || state.reloadRemaining > 0 || state.magazine === weapon.magazineSize || state.reserve <= 0) return false;
  state.reloadRemaining = weapon.reloadTime; return true;
}
export function consumeShot(state: CombatState, weapon: WeaponDefinition): boolean {
  if (!state.equipped || !state.aiming || state.reloadRemaining > 0 || state.cooldown > 1e-6 || state.magazine <= 0) return false;
  state.magazine--; state.shotsFired++; state.cooldown = 1 / weapon.fireRate; return true;
}
/** Same muzzle transform for physics and the visual adapter; local forward follows the aim ray. */
export function getMuzzle(position: CombatPoint, direction: CombatPoint): CombatPoint {
  const length = Math.hypot(direction.x, direction.z) || 1;
  const fx = direction.x / length, fz = direction.z / length, offset = combatConfig.muzzle;
  return { x: position.x - fz * offset.right + fx * offset.forward,
    y: position.y + offset.height, z: position.z + fx * offset.right + fz * offset.forward };
}
