import { defaultGameConfig } from './Config';
import { GameLoop } from './GameLoop';
import { Time } from './Time';
import { PerformanceMonitor } from '../diagnostics/PerformanceMonitor';
import { InputManager } from '../input/InputManager';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { CameraManager } from '../render/CameraManager';
import { Renderer } from '../render/Renderer';
import { SceneManager } from '../render/SceneManager';
import { createEntityState } from '../simulation/Entity';
import { WorldState } from '../simulation/WorldState';
import { DebugHUD } from '../ui/DebugHUD';
import { World } from '../world/World';

export class Game {
  private readonly config = defaultGameConfig;
  private readonly time = new Time();
  private readonly physics = new PhysicsWorld();
  private readonly sceneManager = new SceneManager();
  private readonly cameraManager = new CameraManager();
  private readonly input = new InputManager();
  private readonly diagnostics = new PerformanceMonitor();
  private readonly worldState = new WorldState(20_260_909);
  private readonly world = new World();
  private renderer: Renderer | undefined;
  private debugHud: DebugHUD | undefined;
  private gameLoop: GameLoop | undefined;
  private lastDeltaSeconds = 0;
  private initialized = false;

  public constructor(private readonly host: HTMLElement) {}

  public async initialize(): Promise<void> {
    if (this.initialized) return;
    await this.physics.initialize();

    this.renderer = new Renderer(this.host, this.config.rendering);
    this.world.initialize(this.sceneManager.scene, this.physics);
    this.worldState.addEntity(createEntityState('world:prototype', 'world', [0, 0, 0]));
    this.worldState.setRegionActive('origin', true);

    if (this.config.diagnostics.enabled) this.debugHud = new DebugHUD(this.host);

    this.gameLoop = new GameLoop(this, this.config.physics);
    this.input.onPressed('pause', () => {
      const loop = this.requireGameLoop();
      loop.setPaused(!loop.isPaused);
    });
    this.initialized = true;
  }

  public start(): void {
    this.requireGameLoop().start();
  }

  public fixedUpdate(deltaSeconds: number): void {
    this.physics.step(deltaSeconds);
    this.world.syncPhysics();
  }

  public update(frame: { readonly deltaSeconds: number }): void {
    this.lastDeltaSeconds = this.time.advance(frame.deltaSeconds, this.config.physics.maxDeltaSeconds).deltaSeconds;
    this.cameraManager.update(this.input);
    if (this.input.consumePressed('toggleDebug')) this.debugHud?.toggle();
  }

  public render(): void {
    const renderer = this.requireRenderer();
    renderer.render(this.sceneManager.scene, this.cameraManager.camera);
    this.diagnostics.observe(this.lastDeltaSeconds, renderer.drawCalls, renderer.triangleCount, this.physics.bodyCount);
    this.debugHud?.update(this.diagnostics.getSnapshot());
  }

  public dispose(): void {
    this.gameLoop?.stop();
    this.debugHud?.dispose();
    this.input.dispose();
    this.cameraManager.dispose();
    this.sceneManager.dispose();
    this.physics.dispose();
    this.renderer?.dispose();
    this.initialized = false;
  }

  private requireRenderer(): Renderer {
    if (this.renderer === undefined) throw new Error('Game renderer is not initialized.');
    return this.renderer;
  }

  private requireGameLoop(): GameLoop {
    if (this.gameLoop === undefined) throw new Error('Game loop is not initialized.');
    return this.gameLoop;
  }
}
