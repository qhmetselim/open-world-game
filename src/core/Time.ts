export interface FrameTime {
  readonly deltaSeconds: number;
  readonly elapsedSeconds: number;
}

export class Time {
  private elapsedSeconds = 0;

  public advance(rawDeltaSeconds: number, maxDeltaSeconds: number): FrameTime {
    const deltaSeconds = Math.min(Math.max(rawDeltaSeconds, 0), maxDeltaSeconds);
    this.elapsedSeconds += deltaSeconds;

    return { deltaSeconds, elapsedSeconds: this.elapsedSeconds };
  }

  public reset(): void {
    this.elapsedSeconds = 0;
  }
}
