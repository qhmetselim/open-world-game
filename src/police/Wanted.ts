import type { CombatEvent } from '../combat/CombatController';
import type { CombatPoint } from '../combat/CombatState';
import { policeConfig as config } from './PoliceConfig';

export type WantedPhase = 'CLEAR' | 'CHASE' | 'SEARCH';
export interface WantedState {
  level: number; points: number; phase: WantedPhase; phaseSeconds: number;
  unseenSeconds: number; crimeSeconds: number; contactEstablished: boolean;
  lastKnown: CombatPoint; searching: boolean; responseRevision: number;
}
/** The only authority for pursuit transitions. Entity counts are deliberately not inputs. */
export class Wanted {
  public readonly state: WantedState = {
    level: 0, points: 0, phase: 'CLEAR', phaseSeconds: 0, unseenSeconds: 0,
    crimeSeconds: 0, contactEstablished: false, lastKnown: { x: 0, y: 0, z: 0 },
    searching: false, responseRevision: 0
  };
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
    this.state.lastKnown = { ...position };
    this.state.unseenSeconds = 0;
    this.state.crimeSeconds = 0;
    // Dispatch is not an escape. A response must acquire the suspect before it
    // can lose them; a fresh crime (including killing the last witness) re-arms this gate.
    this.state.contactEstablished = false;
    this.state.responseRevision++;
    this.transition('CHASE');
  }
  public step(dt: number, seen: boolean, position: CombatPoint): void {
    if (this.state.phase === 'CLEAR') return;
    this.state.crimeSeconds += dt;
    this.state.phaseSeconds += dt;
    if (seen) {
      // One actual sighting is a radio report for every response unit, not a FOV
      // requirement for each car. SEARCH never updates this position without LOS.
      this.state.lastKnown = { ...position };
      this.state.unseenSeconds = 0;
      this.state.contactEstablished = true;
      if (this.state.phase !== 'CHASE') this.transition('CHASE');
      return;
    }
    this.state.unseenSeconds += dt;
    if (this.state.phase === 'CHASE') {
      const persistence = config.chaseByLevel[this.state.level] ?? config.loseSightSeconds;
      if (this.state.contactEstablished && this.state.unseenSeconds >= persistence
        && this.state.crimeSeconds >= config.crimeGraceSeconds) this.transition('SEARCH');
      return;
    }
    if (this.state.phaseSeconds >= (config.searchByLevel[this.state.level] ?? config.loseSightSeconds) + config.decaySeconds) {
      this.state.level--;
      this.state.points = config.thresholds[this.state.level] ?? 0;
      if (this.state.level === 0) this.reset();
      else this.transition('SEARCH');
    }
  }
  public reset(): void {
    Object.assign(this.state, { level: 0, points: 0, unseenSeconds: 0, crimeSeconds: 0, contactEstablished: false });
    this.transition('CLEAR');
  }
  private transition(phase: WantedPhase): void {
    this.state.phase = phase;
    this.state.phaseSeconds = 0;
    this.state.searching = phase === 'SEARCH'; // Compatibility projection for HUD/minimap snapshots.
  }
}
