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

  public update(options: { readonly canEnter: boolean; readonly driving: boolean; readonly speedKmh: number; readonly worldPrompt?: string }): void {
    // Feedback affects the shared prompt, never the controlled-entity speed visibility.
    this.speed.hidden = !options.driving;
    if (options.driving) this.speed.textContent = `${Math.round(options.speedKmh)} km/h`;
    if (performance.now() < this.feedbackUntil) return;
    if (options.driving) {
      this.interaction.textContent = 'E — Exit vehicle';
      this.interaction.hidden = false;
      return;
    }
    this.speed.hidden = true;
    this.interaction.textContent = options.worldPrompt === undefined ? 'E — Enter vehicle' : `E — ${options.worldPrompt}`;
    this.interaction.hidden = !options.canEnter && options.worldPrompt === undefined;
  }

  public showFeedback(message: string, durationSeconds: number): void {
    this.interaction.textContent = message;
    this.interaction.hidden = false;
    this.feedbackUntil = performance.now() + durationSeconds * 1_000;
  }

  public clearFeedback(): void { this.feedbackUntil = 0; }

  public dispose(): void {
    this.interaction.remove();
    this.speed.remove();
  }
}
