import type { WantedState } from '../police/Wanted';
export class WantedHUD {
  private readonly element = document.createElement('div');
  public constructor(host: HTMLElement) {
    this.element.setAttribute('aria-label','Wanted');
    this.element.style.cssText='position:fixed;right:20px;top:156px;color:#ffda87;background:#152431c9;padding:8px 12px;border-radius:5px;font:16px monospace;pointer-events:none';
    host.append(this.element);
  }
  public update(state: WantedState, dead: boolean): void {
    this.element.hidden=!state.level&&!dead;
    this.element.textContent=dead?'DOWN · Respawning…':`${'★'.repeat(state.level)}${'☆'.repeat(3-state.level)} · ${state.searching?'SEARCH':'WANTED'}`;
  }
  public dispose(): void { this.element.remove(); }
}
