import type { PerformanceSnapshot } from '../diagnostics/PerformanceMonitor';

export class DebugHUD {
  private readonly element: HTMLElement;
  private visible = true;

  public constructor(host: HTMLElement) {
    this.element = document.createElement('aside');
    this.element.className = 'debug-hud';
    this.element.setAttribute('aria-live', 'polite');
    host.append(this.element);
  }

  public update(snapshot: PerformanceSnapshot): void {
    this.element.textContent = [
      `FPS ${snapshot.fps.toFixed(0)}`,
      `${snapshot.frameTimeMs.toFixed(1)} ms`,
      `Draw calls ${snapshot.drawCalls}`,
      `Triangles ${snapshot.triangles.toLocaleString()}`,
      `Physics bodies ${snapshot.physicsBodies}`,
      'F3: debug HUD · Right-drag: camera'
    ].join('\n');
  }

  public toggle(): void {
    this.visible = !this.visible;
    this.element.hidden = !this.visible;
  }

  public dispose(): void {
    this.element.remove();
  }
}
