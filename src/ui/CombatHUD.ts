import type { CombatController } from '../combat/CombatController';
import type { HealthState } from '../combat/Health';
export class CombatHUD {
  private readonly status = document.createElement('div');
  private readonly crosshair = document.createElement('div');
  public constructor(host: HTMLElement) {
    this.status.className = 'combat-status'; this.status.setAttribute('aria-label', 'Combat');
    this.crosshair.className = 'combat-crosshair'; this.crosshair.setAttribute('aria-hidden', 'true');
    host.append(this.status, this.crosshair);
  }
  public update(combat: CombatController, health: HealthState, allowed: boolean): void {
    const state = combat.state;
    this.status.hidden = !allowed;
    this.status.textContent = state.equipped
      ? `PISTOL ${state.magazine} / ${state.reserve} · HP ${health.current}${state.reloadRemaining > 0 ? ' · Reloading…' : ' · RMB aim / LMB fire · R reload · Q holster'}${combat.hitRemaining > 0 ? ` · ${combat.lastHit === 'killed' ? 'NPC DOWN' : combat.lastHit === 'npc' ? 'HIT' : 'Impact'}` : ''}`
      : `HP ${health.current} · Q — Equip pistol`;
    this.crosshair.hidden = !allowed || !state.aiming;
    this.crosshair.textContent = combat.hitRemaining > 0 && combat.lastHit !== 'world' ? '×' : '+';
    this.crosshair.dataset.hit = combat.hitRemaining > 0 ? 'true' : 'false';
  }
  public dispose(): void { this.status.remove(); this.crosshair.remove(); }
}
