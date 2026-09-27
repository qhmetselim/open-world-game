import type { CombatEvent } from '../combat/CombatController';
import type { CombatPoint } from '../combat/CombatState';
import { policeConfig as config } from './PoliceConfig';

export interface WantedState { level: number; points: number; unseenSeconds: number; lastKnown: CombatPoint; searching: boolean }
export class Wanted {
  public readonly state: WantedState = { level: 0, points: 0, unseenSeconds: 0, lastKnown: { x: 0,y: 0,z: 0 }, searching: false };
  public crime(event: CombatEvent, position: CombatPoint): void {
    // Discharging a weapon is feedback, not a crime. Only confirmed damage/kills add heat.
    if (event.actorId !== 'player:prototype' || event.type === 'weaponFired') return;
    if (event.type === 'npcDamaged' && event.damage <= 0) return;
    const police = event.npcId.startsWith('police:');
    const heat = event.type === 'npcKilled'
      ? (police ? config.crime.policeKill : config.crime.civilianKill)
      : (police ? config.crime.policeDamage : config.crime.civilianDamage);
    this.state.points = Math.min(config.maxHeat, this.state.points + heat);
    this.state.level = this.state.points >= config.thresholds[3] ? 3 : this.state.points >= config.thresholds[2] ? 2 : 1;
    this.state.lastKnown = { ...position }; this.state.unseenSeconds = 0; this.state.searching = false;
  }
  public step(dt: number, seen: boolean, position: CombatPoint): void {
    if (!this.state.level) return;
    if (seen) { this.state.lastKnown = { ...position }; this.state.unseenSeconds = 0; this.state.searching = false; return; }
    this.state.searching = true; this.state.unseenSeconds += dt;
    const searchSeconds = config.searchByLevel[this.state.level] ?? config.loseSightSeconds;
    if (this.state.unseenSeconds >= searchSeconds + config.decaySeconds) {
      this.state.level--; this.state.points = config.thresholds[this.state.level] ?? 0;
      this.state.unseenSeconds = config.searchByLevel[this.state.level] ?? 0;
    }
  }
  public reset(): void { Object.assign(this.state, { level: 0, points: 0, unseenSeconds: 0, searching: false }); }
}
