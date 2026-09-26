import type { CombatPoint } from '../combat/CombatState';
import { policeConfig } from '../police/PoliceConfig';
import { hashStringToSeed } from '../world/SeededNoise';
import type { PersonalAssets } from './PersonalAssets';

export interface MoneyDrop { id: string; position: CombatPoint; amount: number; age: number }
/** Bounded session drops; credits go through the existing integer-kuruş economy API. */
export class MoneyDrops {
  public readonly active = new Map<string, MoneyDrop>();
  public spawn(id: string, position: CombatPoint): void {
    if (id.startsWith('police:') || this.active.has(id)) return;
    if (this.active.size >= policeConfig.drops.max) this.active.delete(this.active.keys().next().value!);
    this.active.set(id, { id, position: { ...position }, age: 0,
      amount: policeConfig.drops.minKurus + hashStringToSeed(id) % policeConfig.drops.variationKurus });
  }
  public step(dt: number, player: CombatPoint, onFoot: boolean, assets: PersonalAssets,
    visible: (from: CombatPoint, to: CombatPoint) => boolean): void {
    for (const [id, drop] of this.active) {
      drop.age += dt;
      if (drop.age >= policeConfig.drops.lifetime) { this.active.delete(id); continue; }
      if (onFoot && Math.hypot(player.x-drop.position.x, player.z-drop.position.z) < policeConfig.drops.pickupRadius
        && Math.abs(player.y-drop.position.y) < 2.5 && visible(player, { ...drop.position, y: drop.position.y+.5 })) {
        assets.addMoney(drop.amount); this.active.delete(id);
      }
    }
  }
}
