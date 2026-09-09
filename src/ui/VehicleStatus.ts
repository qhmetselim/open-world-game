export class VehicleStatus {
  private readonly interaction: HTMLDivElement;
  private readonly speed: HTMLDivElement;
  private feedbackUntil = 0;

  public constructor(host: HTMLElement) {
    this.interaction = document.createElement('div');
    this.interaction.className = 'vehicle-interaction';
    this.interaction.hidden = true;
    host.append(this.interaction);
    this.speed = document.createElement('div');
    this.speed.className = 'vehicle-speed';
    this.speed.hidden = true;
    host.append(this.speed);
  }

  public update(options: { readonly canEnter: boolean; readonly driving: boolean; readonly speedKmh: number }): void {
    if (performance.now() < this.feedbackUntil) return;
    if (options.driving) {
      this.interaction.textContent = 'E — Exit vehicle';
      this.interaction.hidden = false;
      this.speed.textContent = `${Math.round(options.speedKmh)} km/h`;
      this.speed.hidden = false;
      return;
    }
    this.speed.hidden = true;
    this.interaction.textContent = 'E — Enter vehicle';
    this.interaction.hidden = !options.canEnter;
  }

  public showFeedback(message: string, durationSeconds: number): void {
    this.interaction.textContent = message;
    this.interaction.hidden = false;
    this.feedbackUntil = performance.now() + durationSeconds * 1_000;
  }

  public dispose(): void {
    this.interaction.remove();
    this.speed.remove();
  }
}
