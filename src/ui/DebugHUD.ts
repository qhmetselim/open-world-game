import type { PerformanceSnapshot } from '../diagnostics/PerformanceMonitor';
import type { WorldStreamingDebugInfo } from '../world/World';
import type { PlayerState } from '../player/PlayerState';

export class DebugHUD {
  private readonly element: HTMLElement;
  private visible = true;

  public constructor(host: HTMLElement) {
    this.element = document.createElement('aside');
    this.element.className = 'debug-hud';
    this.element.setAttribute('aria-live', 'polite');
    host.append(this.element);
  }

  public update(snapshot: PerformanceSnapshot, world: WorldStreamingDebugInfo, player: PlayerState, cameraMode: string): void {
    const chunk = world.currentChunk === undefined ? '—' : `${world.currentChunk.x}:${world.currentChunk.z}`;
    this.element.textContent = [
      `FPS ${snapshot.fps.toFixed(0)}`,
      `${snapshot.frameTimeMs.toFixed(1)} ms`,
      `Draw calls ${snapshot.drawCalls}`,
      `Triangles ${snapshot.triangles.toLocaleString()}`,
      `Physics bodies ${snapshot.physicsBodies}`,
      `Seed ${world.seed}`,
      `Focus ${world.focusPosition.x.toFixed(1)}, ${world.focusPosition.z.toFixed(1)} · Chunk ${chunk}`,
      `Chunks ${world.activeChunkCount} active · ${world.generatedChunkCount} generated`,
      `Chunk loads ${world.chunkLoadCount} · unloads ${world.chunkUnloadCount}`,
      `Player ${player.position.x.toFixed(1)}, ${player.position.y.toFixed(1)}, ${player.position.z.toFixed(1)} · ${Math.hypot(player.velocity.x, player.velocity.z).toFixed(1)} u/s`,
      `Grounded ${player.grounded ? 'yes' : 'no'} · Camera ${cameraMode}`,
      'F3: debug HUD · WASD: move · Shift: sprint · Space: jump · F2: dev camera'
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
