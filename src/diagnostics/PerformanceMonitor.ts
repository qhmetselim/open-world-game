export interface PerformanceSnapshot {
  readonly fps: number;
  readonly frameTimeMs: number;
  readonly drawCalls: number;
  readonly triangles: number;
  readonly physicsBodies: number;
}

export class PerformanceMonitor {
  private frameCount = 0;
  private elapsedSinceSample = 0;
  private snapshot: PerformanceSnapshot = {
    fps: 0,
    frameTimeMs: 0,
    drawCalls: 0,
    triangles: 0,
    physicsBodies: 0
  };

  public observe(deltaSeconds: number, drawCalls: number, triangles: number, physicsBodies: number): void {
    this.frameCount += 1;
    this.elapsedSinceSample += deltaSeconds;
    if (this.elapsedSinceSample < 0.25) return;

    this.snapshot = {
      fps: this.frameCount / this.elapsedSinceSample,
      frameTimeMs: (this.elapsedSinceSample / this.frameCount) * 1000,
      drawCalls,
      triangles,
      physicsBodies
    };
    this.frameCount = 0;
    this.elapsedSinceSample = 0;
  }

  public getSnapshot(): PerformanceSnapshot {
    return this.snapshot;
  }
}
