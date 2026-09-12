import type { FrameTime } from './Time';

export interface GameLoopCallbacks {
  fixedUpdate(deltaSeconds: number): void;
  update(frame: FrameTime): void;
  render(alpha: number): void;
}

export interface GameLoopOptions {
  readonly fixedTimeStep: number;
  readonly maxSubSteps: number;
  readonly maxDeltaSeconds: number;
}

export class FixedStepAccumulator {
  private accumulator = 0;

  public consume(deltaSeconds: number, fixedTimeStep: number, maxSubSteps: number): number {
    this.accumulator += deltaSeconds;
    const availableSteps = Math.floor((this.accumulator + 1e-10) / fixedTimeStep);
    const stepCount = Math.min(availableSteps, maxSubSteps);

    this.accumulator = Math.max(0, this.accumulator - stepCount * fixedTimeStep);
    if (availableSteps > maxSubSteps) {
      this.accumulator = 0;
    }

    return stepCount;
  }

  public reset(): void {
    this.accumulator = 0;
  }

  public alpha(fixedTimeStep: number): number {
    return Math.min(1, this.accumulator / fixedTimeStep);
  }
}

export class GameLoop {
  private animationFrameId: number | undefined;
  private lastTimestampMs: number | undefined;
  private readonly accumulator = new FixedStepAccumulator();
  private paused = false;

  public constructor(
    private readonly callbacks: GameLoopCallbacks,
    private readonly options: GameLoopOptions,
  ) {}

  public start(): void {
    if (this.animationFrameId !== undefined) return;
    this.animationFrameId = requestAnimationFrame(this.onAnimationFrame);
  }

  public stop(): void {
    if (this.animationFrameId !== undefined) cancelAnimationFrame(this.animationFrameId);
    this.animationFrameId = undefined;
    this.lastTimestampMs = undefined;
    this.accumulator.reset();
  }

  public setPaused(paused: boolean): void {
    this.paused = paused;
    if (!paused) this.lastTimestampMs = undefined;
  }

  public get isPaused(): boolean {
    return this.paused;
  }

  private readonly onAnimationFrame = (timestampMs: number): void => {
    this.animationFrameId = requestAnimationFrame(this.onAnimationFrame);
    if (this.paused) return;

    const previousTimestampMs = this.lastTimestampMs ?? timestampMs;
    this.lastTimestampMs = timestampMs;
    const unclampedDeltaSeconds = (timestampMs - previousTimestampMs) / 1000;
    const deltaSeconds = Math.min(Math.max(unclampedDeltaSeconds, 0), this.options.maxDeltaSeconds);
    const fixedSteps = this.accumulator.consume(deltaSeconds, this.options.fixedTimeStep, this.options.maxSubSteps);

    for (let step = 0; step < fixedSteps; step += 1) {
      this.callbacks.fixedUpdate(this.options.fixedTimeStep);
    }

    this.callbacks.update({ deltaSeconds, elapsedSeconds: timestampMs / 1000 });
    this.callbacks.render(this.accumulator.alpha(this.options.fixedTimeStep));
  };
}
