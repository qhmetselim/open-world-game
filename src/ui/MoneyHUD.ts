const formatter = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
export function formatMoney(kurus: number): string { return `${formatter.format(kurus / 100)} ₺`; }

export class MoneyHUD {
  private readonly element = document.createElement('div');
  private readonly balance = document.createElement('div');
  private readonly change = document.createElement('div');
  private previous: number | undefined;
  private until = 0;
  public constructor(host: HTMLElement) {
    this.element.className = 'money-hud'; this.element.setAttribute('aria-label', 'Bakiye');
    this.change.className = 'money-change'; this.change.setAttribute('aria-live', 'polite');
    this.element.append(this.balance, this.change); host.append(this.element);
  }
  public update(amount: number): void {
    if (amount !== this.previous) {
      this.balance.textContent = formatMoney(amount);
      if (this.previous !== undefined) {
        const delta = amount - this.previous;
        this.change.textContent = `${delta > 0 ? '+' : '−'}${formatMoney(Math.abs(delta))}`;
        this.change.dataset.direction = delta > 0 ? 'gain' : 'loss'; this.until = performance.now() + 2000;
      }
      this.previous = amount;
    }
    this.change.hidden = performance.now() >= this.until;
  }
  public dispose(): void { this.element.remove(); }
}
