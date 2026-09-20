import type { RigidBody } from '@dimforge/rapier3d-compat';
import type { PhysicsWorld } from '../physics/PhysicsWorld';
import type { NpcManager } from '../npc/NpcManager';
import { combatConfig } from './CombatConfig';
import type { WeaponDefinition } from './CombatConfig';
import { beginReload, consumeShot, createCombatState, getMuzzle, stepWeapon } from './CombatState';
import type { CombatPoint, CombatState } from './CombatState';

export type CombatEvent =
  | { type: 'weaponFired'; actorId: string; weaponId: string; position: CombatPoint; direction: CombatPoint }
  | { type: 'npcDamaged'; actorId: string; npcId: string; damage: number; health: number }
  | { type: 'npcKilled'; actorId: string; npcId: string };
export interface CombatCommand { allowed: boolean; locked: boolean; equip: boolean; aim: boolean; fire: boolean; reload: boolean }

export class CombatController {
  public readonly state: CombatState;
  public flashRemaining = 0;
  public hitRemaining = 0;
  public lastHit: 'world' | 'npc' | 'killed' | undefined;
  private readonly listeners = new Set<(event: CombatEvent) => void>();
  public constructor(private readonly physics: PhysicsWorld, private readonly npcs: NpcManager, public readonly weapon: WeaponDefinition = combatConfig.pistol) {
    this.state = createCombatState(weapon);
  }
  public subscribe(listener: (event: CombatEvent) => void): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  public step(dt: number, command: CombatCommand, playerPosition: CombatPoint, eye: CombatPoint, direction: CombatPoint, self?: RigidBody): void {
    this.flashRemaining = Math.max(0, this.flashRemaining - dt); this.hitRemaining = Math.max(0, this.hitRemaining - dt);
    if (!command.allowed) { this.holster(); stepWeapon(this.state, this.weapon, dt); return; }
    if (command.equip) { if (this.state.equipped) this.holster(); else this.state.equipped = true; }
    stepWeapon(this.state, this.weapon, dt);
    this.state.aiming = this.state.equipped && command.locked && command.aim;
    if (command.reload) beginReload(this.state, this.weapon);
    if (!command.locked || !command.fire || !consumeShot(this.state, this.weapon)) return;
    const targets = this.npcs.getNearbyActive(playerPosition, this.weapon.range).filter((npc) => npc.health.current > 0);
    // Camera identifies the crosshair target. Muzzle ray prevents shooting through nearby cover.
    const sight = this.physics.castCombatRay(eye, direction, this.weapon.range, targets, self);
    const point = sight?.position ?? { x: eye.x + direction.x * this.weapon.range, y: eye.y + direction.y * this.weapon.range, z: eye.z + direction.z * this.weapon.range };
    const muzzle = getMuzzle(playerPosition, direction);
    const dx = point.x - muzzle.x, dy = point.y - muzzle.y, dz = point.z - muzzle.z, length = Math.hypot(dx, dy, dz) || 1;
    // A third-person camera can see a target between the eye and the player.
    // Never reverse the barrel direction to hit something behind the muzzle.
    const forwardTarget = dx * direction.x + dy * direction.y + dz * direction.z > 0;
    const shotDirection = forwardTarget ? { x: dx / length, y: dy / length, z: dz / length } : direction;
    const shoulder = { ...playerPosition, y: playerPosition.y + combatConfig.muzzle.height };
    const mx = muzzle.x - shoulder.x, my = muzzle.y - shoulder.y, mz = muzzle.z - shoulder.z, ml = Math.hypot(mx, my, mz);
    const cover = this.physics.castCombatRay(shoulder, { x: mx / ml, y: my / ml, z: mz / ml }, ml, [], self);
    const hit = cover ?? this.physics.castCombatRay(muzzle, shotDirection, forwardTarget ? Math.min(this.weapon.range, length + .01) : this.weapon.range, targets, self);
    this.flashRemaining = combatConfig.flashSeconds;
    this.lastHit = hit ? 'world' : undefined; this.hitRemaining = hit ? combatConfig.hitFeedbackSeconds : 0;
    this.emit({ type: 'weaponFired', actorId: 'player:prototype', weaponId: this.weapon.id, position: muzzle, direction: shotDirection });
    if (hit?.npcId) {
      const result = this.npcs.damage(hit.npcId, this.weapon.damage);
      if (result && result.damage > 0) {
        this.lastHit = result.killed ? 'killed' : 'npc';
        this.emit({ type: 'npcDamaged', actorId: 'player:prototype', npcId: hit.npcId, damage: result.damage, health: result.health });
        if (result.killed) this.emit({ type: 'npcKilled', actorId: 'player:prototype', npcId: hit.npcId });
      }
    }
  }
  public holster(): void { this.state.equipped = false; this.state.aiming = false; this.state.reloadRemaining = 0; this.flashRemaining = 0; }
  public dispose(): void { this.listeners.clear(); }
  private emit(event: CombatEvent): void { for (const listener of this.listeners) listener(event); }
}
