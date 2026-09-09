import { defaultGameConfig } from './Config';
import { GameLoop } from './GameLoop';
import { Time } from './Time';
import { PerformanceMonitor } from '../diagnostics/PerformanceMonitor';
import { InputManager } from '../input/InputManager';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { CameraManager } from '../render/CameraManager';
import { PlayerView } from '../render/PlayerView';
import { VehicleView } from '../render/VehicleView';
import { Renderer } from '../render/Renderer';
import { SceneManager } from '../render/SceneManager';
import { createEntityState } from '../simulation/Entity';
import { WorldState } from '../simulation/WorldState';
import { DebugHUD } from '../ui/DebugHUD';
import { PointerLockHint } from '../ui/PointerLockHint';
import { World } from '../world/World';
import { PlayerController } from '../player/PlayerController';
import { VehicleController } from '../vehicle/VehicleController';

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
  private vehicle: VehicleController | undefined;
  private vehicleView: VehicleView | undefined;
  private driving = false;
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
    const road = this.world.findNearestRoadSegment({ x: 22, z: 22 }) ?? { x: 22, z: 22, heading: 0 };
    this.vehicle = new VehicleController(this.config.vehicle, this.physics, 'vehicle:development-sedan', { x: road.x, y: this.world.getTerrainHeight(road.x, road.z) + 1.4, z: road.z }, road.heading);
    this.vehicle.initialize();
    this.cameraManager.initialize(this.player.getState());
    this.playerView = new PlayerView(this.sceneManager.scene);
    this.vehicleView = new VehicleView(this.sceneManager.scene);
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
    if (!this.driving) this.player.fixedUpdate(this.input, this.cameraManager.getMovementBasis(), deltaSeconds, this.cameraManager.isThirdPerson, (x, z) => this.world.getTerrainHeight(x, z));
    if (this.driving) { this.vehicle?.fixedUpdate(this.input, deltaSeconds); const position=this.vehicle?.getState().position; if(position) this.player.setLogicalPosition(position); }
    this.worldState.setPlayerState(this.player.serialize());
    this.physics.step(deltaSeconds);
  }

  public update(frame: { readonly deltaSeconds: number }): void {
    this.lastDeltaSeconds = this.time.advance(frame.deltaSeconds, this.config.physics.maxDeltaSeconds).deltaSeconds;
    if (this.input.consumePressed('toggleCamera')) {
      this.cameraManager.toggleMode();
      this.input.clearActionState();
    }
    this.cameraManager.update(this.input, this.lastDeltaSeconds, this.player.getState(), this.physics, this.driving ? this.vehicle?.getBody() : this.player.getPhysicsBody());
    this.world.updateStreaming(this.driving && this.cameraManager.isThirdPerson && this.vehicle !== undefined ? this.vehicle : this.cameraManager);
    if (this.input.consumePressed('toggleDebug')) this.debugHud?.toggle();
    if (this.input.consumePressed('toggleRoadDebug') && this.config.diagnostics.enabled) this.world.toggleRoadGraphDebug();
    if (this.input.consumePressed('toggleBuildingDebug') && this.config.diagnostics.enabled) this.world.toggleBuildingDebug();
    if (this.input.consumePressed('resetVehicle') && this.driving) this.vehicle?.reset((x, z) => this.world.getTerrainHeight(x, z));
    if (this.input.consumePressed('interact')) this.toggleVehicleInteraction();
  }

  public render(): void {
    const renderer = this.requireRenderer();
    this.playerView?.update(this.player.getState());
    if (this.vehicle !== undefined) this.vehicleView?.update(this.vehicle.getState());
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
    this.vehicleView?.dispose(this.sceneManager.scene);
    this.vehicle?.dispose();
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

  private toggleVehicleInteraction(): void {
    const vehicle = this.vehicle;
    if (vehicle === undefined) return;
    if (this.driving) { const state=vehicle.getState(); this.player.resumeAt({x:state.position.x + this.config.vehicle.interaction.exitDistance,z:state.position.z},(x,z)=>this.world.getTerrainHeight(x,z)); this.driving = false; vehicle.setOccupied(false); this.playerView?.setVisible(true); this.input.clearActionState(); return; }
    const player = this.player.getState().position; const position = vehicle.getState().position;
    if (Math.hypot(player.x - position.x, player.z - position.z) <= this.config.vehicle.interaction.enterDistance) { this.player.suspend(); this.driving = true; vehicle.setOccupied(true); this.playerView?.setVisible(false); this.input.clearActionState(); }
  }
}
