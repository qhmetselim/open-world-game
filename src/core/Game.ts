import { defaultGameConfig } from './Config';
import { GameLoop } from './GameLoop';
import { Time } from './Time';
import { PerformanceMonitor } from '../diagnostics/PerformanceMonitor';
import { InputManager } from '../input/InputManager';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { CameraManager } from '../render/CameraManager';
import { PlayerView } from '../render/PlayerView';
import { Renderer } from '../render/Renderer';
import { SceneManager } from '../render/SceneManager';
import { createEntityState } from '../simulation/Entity';
import { WorldState } from '../simulation/WorldState';
import { DebugHUD } from '../ui/DebugHUD';
import { PointerLockHint } from '../ui/PointerLockHint';
import { World } from '../world/World';
import { PlayerController } from '../player/PlayerController';

export class Game {
  private readonly config = defaultGameConfig;
  private readonly time = new Time();
  private readonly physics = new PhysicsWorld();
  private readonly sceneManager = new SceneManager();
  private readonly cameraManager = new CameraManager(this.config.camera);
  private readonly input = new InputManager();
  private readonly diagnostics = new PerformanceMonitor();
  private readonly worldState = new WorldState(this.config.world.seed);
  private readonly world = new World(
    this.config.world,
    this.config.city,
    this.config.building,
    this.config.player.spawnPosition,
    this.config.diagnostics.showChunkBorders
  );
  private readonly player = new PlayerController(this.config.player, this.physics);
  private renderer: Renderer | undefined;
  private debugHud: DebugHUD | undefined;
  private pointerLockHint: PointerLockHint | undefined;
  private playerView: PlayerView | undefined;
  private gameLoop: GameLoop | undefined;
  private lastDeltaSeconds = 0;
  private initialized = false;

  public constructor(private readonly host: HTMLElement) {}

  public async initialize(): Promise<void> {
    if (this.initialized) return;
    await this.physics.initialize();

    this.renderer = new Renderer(this.host, this.config.rendering);
    this.input.configurePointerLock(this.renderer.canvas);
    this.world.initialize(this.sceneManager.scene, this.physics, this.player);
    this.player.initialize((x, z) => this.world.getTerrainHeight(x, z));
    this.cameraManager.initialize(this.player.getState());
    this.playerView = new PlayerView(this.sceneManager.scene);
    this.world.updateStreaming(this.cameraManager);
    this.worldState.addEntity(createEntityState('world:prototype', 'world', [0, 0, 0]));
    this.worldState.setRegionActive('origin', true);
    this.worldState.setPlayerState(this.player.serialize());

    if (this.config.diagnostics.enabled) this.debugHud = new DebugHUD(this.host);
    this.pointerLockHint = new PointerLockHint(this.host, this.input);

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
    this.player.fixedUpdate(
      this.input,
      this.cameraManager.getMovementBasis(),
      deltaSeconds,
      this.cameraManager.isThirdPerson,
      (x, z) => this.world.getTerrainHeight(x, z)
    );
    this.worldState.setPlayerState(this.player.serialize());
    this.physics.step(deltaSeconds);
  }

  public update(frame: { readonly deltaSeconds: number }): void {
    this.lastDeltaSeconds = this.time.advance(frame.deltaSeconds, this.config.physics.maxDeltaSeconds).deltaSeconds;
    if (this.input.consumePressed('toggleCamera')) {
      this.cameraManager.toggleMode();
      this.input.clearActionState();
    }
    this.cameraManager.update(this.input, this.lastDeltaSeconds, this.player.getState(), this.physics, this.player.getPhysicsBody());
    this.world.updateStreaming(this.cameraManager);
    if (this.input.consumePressed('toggleDebug')) this.debugHud?.toggle();
    if (this.input.consumePressed('toggleRoadDebug') && this.config.diagnostics.enabled) this.world.toggleRoadGraphDebug();
    if (this.input.consumePressed('toggleBuildingDebug') && this.config.diagnostics.enabled) this.world.toggleBuildingDebug();
  }

  public render(): void {
    const renderer = this.requireRenderer();
    this.playerView?.update(this.player.getState());
    renderer.render(this.sceneManager.scene, this.cameraManager.camera);
    this.diagnostics.observe(this.lastDeltaSeconds, renderer.drawCalls, renderer.triangleCount, this.physics.bodyCount);
    this.debugHud?.update(this.diagnostics.getSnapshot(), this.world.getDebugInfo(), this.player.getState(), this.cameraManager.modeLabel);
  }

  public dispose(): void {
    this.gameLoop?.stop();
    this.debugHud?.dispose();
    this.pointerLockHint?.dispose();
    this.input.dispose();
    this.cameraManager.dispose();
    this.playerView?.dispose(this.sceneManager.scene);
    this.player.dispose();
    this.world.dispose();
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
