import { defaultGameConfig } from './Config';
import { Vector3 } from 'three';
import { CombatController } from '../combat/CombatController';
import { CombatView } from '../render/CombatView';
import { CombatHUD } from '../ui/CombatHUD';
import { PersonalAssets } from '../economy/PersonalAssets';
import { economyConfig, developmentOffer } from '../economy/EconomyConfig';
import { MoneyHUD } from '../ui/MoneyHUD';
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
import { VehicleStatus } from '../ui/VehicleStatus';
import { World } from '../world/World';
import { PlayerController } from '../player/PlayerController';
import { VehicleController } from '../vehicle/VehicleController';
import { VehicleManager } from '../vehicle/VehicleManager';
import { createVehicleState } from '../vehicle/VehicleState';
import { findSafeExitCandidate, getVehicleExitCandidates, isVehicleEnterEligible } from '../vehicle/VehicleInteraction';
import { metersPerSecondToKmh } from '../vehicle/VehicleMovement';
import { NpcManager } from '../npc/NpcManager';
import { TrafficManager } from '../traffic/TrafficManager';
import { InteractionManager } from '../interaction/InteractionManager';
import { WorldInteractions } from '../interaction/WorldInteractions';
import { dispatchInteraction, resolveInteractionContext } from '../interaction/InteractionState';
import type { InteractionContext } from '../interaction/InteractionState';

export class Game {
  private readonly config = defaultGameConfig;
  private readonly time = new Time();
  private readonly physics = new PhysicsWorld();
  private readonly sceneManager = new SceneManager();
  private readonly cameraManager = new CameraManager(this.config.camera, this.config.vehicle.camera);
  private readonly input = new InputManager();
  private readonly diagnostics = new PerformanceMonitor();
  private readonly worldState = new WorldState(this.config.world.seed);
  private readonly personalAssets = new PersonalAssets(economyConfig.initialBalance);
  private moneyHud: MoneyHUD | undefined;
  private readonly world = new World(
    this.config.world,
    this.config.city,
    this.config.building,
    this.config.player.spawnPosition,
    this.config.diagnostics.showChunkBorders,
    this.config.interaction
  );
  private readonly player = new PlayerController(this.config.player, this.physics);
  private readonly vehicles = new VehicleManager();
  private readonly interactions = new InteractionManager(this.sceneManager.scene, this.physics, this.config.interaction, (action) => this.useWorldAction(action));
  private readonly worldInteractions = new WorldInteractions(this.world, this.interactions, this.config.interaction, this.config.world.chunkSize, this.config.player.spawnPosition, import.meta.env.DEV);
  private interactionContext: InteractionContext | undefined;
  private readonly npcs = new NpcManager(
    this.sceneManager.scene,
    this.config.npc,
    this.config.world.seed,
    (x, z, surface) => this.world.getWalkableSurfaceHeight(x, z, surface)
  );
  private readonly traffic = new TrafficManager(
    this.sceneManager.scene,
    this.physics,
    this.config.traffic,
    this.config.vehicle.sedan,
    this.config.world.seed,
    (x, z) => this.world.getTerrainHeight(x, z),
    (lane, x, z) => this.world.isTrafficLaneLoaded(lane, x, z),
    (point, radius) => this.npcs.getNearbyActive(point, radius)
  );
  private readonly combat = new CombatController(this.physics, this.npcs);
  private readonly combatView = new CombatView(this.sceneManager.scene);
  private combatHud: CombatHUD | undefined;
  private readonly aimDirection = new Vector3(0, 0, -1);
  private equipRequested = false;
  private reloadRequested = false;
  private renderer: Renderer | undefined;
  private debugHud: DebugHUD | undefined;
  private pointerLockHint: PointerLockHint | undefined;
  private vehicleStatus: VehicleStatus | undefined;
  private playerView: PlayerView | undefined;
  private vehicle: VehicleController | undefined;
  private driving = false;
  private gameLoop: GameLoop | undefined;
  private lastDeltaSeconds = 0;
  private initialized = false;

  public constructor(private readonly host: HTMLElement) {}

  public async initialize(developmentStart?: 'door' | 'toggle' | 'vehicle' | 'interior' | 'purchase' | 'traffic'): Promise<void> {
    if (this.initialized) return;
    await this.physics.initialize();

    this.renderer = new Renderer(this.host, this.config.rendering);
    this.input.configurePointerLock(this.renderer.canvas);
    this.world.initialize(this.sceneManager.scene, this.physics, this.player);
    this.player.initialize((x, z) => this.world.getTerrainHeight(x, z));
    const spawn = this.config.player.spawnPosition;
    const road = this.world.findNearestRoadSegment(spawn) ?? { x: spawn.x + 16, z: spawn.z + 16, heading: 0 };
    this.vehicle = new VehicleController(
      this.config.vehicle,
      this.physics,
      'vehicle:development-sedan',
      { x: road.x, y: this.world.getTerrainHeight(road.x, road.z) + 1.4, z: road.z },
      road.heading
    );
    this.vehicle.initialize();
    this.cameraManager.initialize(this.player.getState());
    this.playerView = new PlayerView(this.sceneManager.scene, this.config.player.capsuleHalfHeight + this.config.player.capsuleRadius);
    this.vehicles.register(this.vehicle, new VehicleView(this.sceneManager.scene, this.config.vehicle.sedan));
    this.world.updateStreaming(this.cameraManager);
    this.worldInteractions.sync();
    if (import.meta.env.DEV && developmentStart !== undefined) {
      // Reproducible browser fixture only: change initial position before the loop starts.
      // Subsequent movement, E arbitration, camera and physics are the production paths.
      const item = this.interactions.getActiveItems().filter((candidate) => developmentStart === 'interior'
        ? this.world.getInteriorLayouts().some((layout) => layout.door.id === candidate.id)
        : developmentStart === 'purchase' ? candidate.useAction === 'purchase:development' : candidate.type === developmentStart && !candidate.useAction)
        .sort((a, b) => Math.hypot(a.position.x - spawn.x, a.position.z - spawn.z) - Math.hypot(b.position.x - spawn.x, b.position.z - spawn.z))[0];
      if (item !== undefined) {
        this.player.resumeAt({ x: item.position.x + Math.sin(item.yaw) * 2, z: item.position.z + Math.cos(item.yaw) * 2 }, (x, z) => this.world.getTerrainHeight(x, z));
        this.player.getState().facingYaw = -item.yaw;
        this.cameraManager.initialize(this.player.getState(), -item.yaw);
      } else if (developmentStart === 'vehicle') {
        const position = this.vehicle.getState().position;
        this.player.resumeAt({ x: position.x - 2.5, z: position.z }, (x, z) => this.world.getTerrainHeight(x, z));
        this.cameraManager.initialize(this.player.getState());
      } else if (developmentStart === 'traffic') {
        this.player.resumeAt({ x: 210, z: 210 }, (x, z) => this.world.getTerrainHeight(x, z));
        this.cameraManager.initialize(this.player.getState());
      }
    }
    this.worldState.addEntity(createEntityState('world:prototype', 'world', [0, 0, 0]));
    this.worldState.setRegionActive('origin', true);
    this.worldState.setPlayerState(this.player.serialize());
    this.worldState.setPersonalAssets(this.personalAssets);
    this.moneyHud = new MoneyHUD(this.host);
    this.combatHud = new CombatHUD(this.host);
    this.moneyHud.update(this.personalAssets.balance);

    if (this.config.diagnostics.enabled) this.debugHud = new DebugHUD(this.host);
    this.pointerLockHint = new PointerLockHint(this.host, this.input);
    this.vehicleStatus = new VehicleStatus(this.host);

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
    this.interactions.fixedUpdate(deltaSeconds);
    if (!this.driving) {
      this.player.fixedUpdate(
        this.input,
        this.cameraManager.getMovementBasis(),
        deltaSeconds,
        this.cameraManager.isPlayerThirdPerson,
        (x, z) => this.world.getTerrainHeight(x, z)
      );
    }
    for (const vehicle of this.vehicles.getAll()) {
      const controlled = this.driving && vehicle === this.vehicle;
      const position = vehicle.getState().position;
      const enabled = controlled || this.world.isPositionLoaded(position.x, position.z);
      this.vehicles.setSimulationEnabled(vehicle, enabled);
      if (!enabled) continue;
      if (controlled && !this.cameraManager.isDevelopment) vehicle.fixedUpdate(this.input, deltaSeconds);
      else vehicle.idleFixedUpdate(deltaSeconds);
    }
    const trafficFocus = this.driving && this.vehicle !== undefined ? this.vehicle.getState().position : this.player.getState().position;
    const playerTrafficObstacle = this.vehicles.getAll().filter((vehicle) => vehicle.getBody()?.isEnabled()).map((vehicle) => ({
      x: vehicle.getState().position.x, z: vehicle.getState().position.z, speed: vehicle.getState().speed
    }));
    // Vehicle controllers write forces before Rapier advances, just like the player sedan.
    this.traffic.fixedUpdate(deltaSeconds, trafficFocus, this.world.getPedestrianNetworkAround(trafficFocus), playerTrafficObstacle);
    this.physics.step(deltaSeconds);
    this.traffic.captureAfterStep();
    for (const vehicle of this.vehicles.getAll()) if (vehicle.getBody()?.isEnabled()) vehicle.syncFromPhysics();
    if (this.vehicle !== undefined) {
      if (this.driving && this.vehicle.getState().position.y < this.config.vehicle.recovery.killY) this.vehicle.reset((x, z) => this.world.getTerrainHeight(x, z));
      if (this.driving) {
        const position = this.vehicle.getState().position;
        this.player.setLogicalPosition({ x: position.x, y: position.y + this.config.vehicle.camera.targetHeight, z: position.z });
      }
    }
    const npcFocus = this.driving && this.vehicle !== undefined ? this.vehicle.getState().position : this.player.getState().position;
    this.npcs.fixedUpdate(deltaSeconds, npcFocus, this.world.getPedestrianNetworkAround(npcFocus));
    this.combat.step(deltaSeconds, {
      allowed: !this.driving && this.cameraManager.isPlayerThirdPerson && this.player.getState().health.current > 0,
      locked: this.input.isPointerLocked, equip: this.equipRequested, reload: this.reloadRequested,
      aim: this.input.isActive('aim'), fire: this.input.consumePressed('fire')
    }, this.player.getState().position, this.cameraManager.camera.position, this.aimDirection, this.player.getPhysicsBody());
    this.equipRequested = false; this.reloadRequested = false;
    this.worldState.setPlayerState(this.player.serialize());
  }

  public update(frame: { readonly deltaSeconds: number }): void {
    this.lastDeltaSeconds = this.time.advance(frame.deltaSeconds, this.config.physics.maxDeltaSeconds).deltaSeconds;
    if (this.input.consumePressed('toggleCamera')) {
      this.cameraManager.toggleMode();
      this.input.clearActionState();
    }
    this.world.updateStreaming(this.cameraManager.isDevelopment ? this.cameraManager : this.driving && this.vehicle !== undefined ? this.vehicle : this.player);
    this.worldInteractions.sync();
    this.world.updateInteriors(this.player.getWorldPosition());
    if (this.input.consumePressed('toggleDebug')) this.debugHud?.toggle();
    if (this.input.consumePressed('toggleRoadDebug') && this.config.diagnostics.enabled) this.world.toggleRoadGraphDebug();
    if (this.input.consumePressed('toggleBuildingDebug') && this.config.diagnostics.enabled) this.world.toggleBuildingDebug();
    if (this.input.consumePressed('toggleVehicleDebug') && this.config.diagnostics.enabled) {
      this.vehicleDebugVisible = !this.vehicleDebugVisible;
      this.vehicles.setDebugVisible(this.vehicleDebugVisible);
    }
    if (this.input.consumePressed('toggleNpcDebug') && this.config.diagnostics.enabled) this.npcs.toggleDebug();
    if (this.input.consumePressed('toggleTrafficDebug') && this.config.diagnostics.enabled) this.traffic.toggleDebug();
    // One physical R press has exactly one contextual owner: vehicle reset OR weapon reload.
    if (this.input.consumePressed('resetVehicle')) {
      if (this.driving) this.vehicle?.reset((x, z) => this.world.getTerrainHeight(x, z));
      else this.reloadRequested = true;
    }
    if (this.input.consumePressed('toggleWeapon')) this.equipRequested = true;
    const player = this.player.getState();
    const focused = this.interactions.updateFocus(player.position, player.facingYaw, this.player.getPhysicsBody(), !this.driving && !this.cameraManager.isDevelopment);
    const canEnter = !this.cameraManager.isDevelopment && this.getVehicleEnterTarget() !== undefined;
    this.interactionContext = resolveInteractionContext(this.driving, focused, canEnter);
    if (this.input.consumePressed('interact')) {
      dispatchInteraction(this.interactionContext, () => { this.interactions.interactFocused(); }, () => this.toggleVehicleInteraction());
    }
  }

  public render(alpha = 1): void {
    const renderer = this.requireRenderer();
    const player = this.player.getRenderState(alpha);
    const vehicleRender = this.vehicle?.getRenderState(alpha);
    this.cameraManager.update(this.input, this.lastDeltaSeconds, player, this.physics,
      this.driving ? this.vehicle?.getBody() : this.player.getPhysicsBody(), this.driving ? vehicleRender : undefined, this.combat.state.aiming);
    this.cameraManager.camera.getWorldDirection(this.aimDirection);
    this.playerView?.update(player, this.combat.state.equipped, this.combat.state.aiming ? this.aimDirection : undefined);
    this.combatView.update(player, this.combat.state, this.aimDirection, this.combat.flashRemaining);
    this.combatHud?.update(this.combat, player.health, !this.driving && this.cameraManager.isPlayerThirdPerson);
    this.vehicles.render(alpha);
    this.npcs.render(this.lastDeltaSeconds);
    this.traffic.render(alpha);
    this.interactions.render(alpha);
    this.sceneManager.update(this.cameraManager.camera);
    this.world.updateEnvironmentVisibility(this.cameraManager.camera.position);
    renderer.render(this.sceneManager.scene, this.cameraManager.camera);
    this.diagnostics.observe(this.lastDeltaSeconds, renderer.drawCalls, renderer.triangleCount, this.physics.bodyCount);
    this.moneyHud?.update(this.personalAssets.balance);
    this.debugHud?.update(this.diagnostics.getSnapshot(), this.world.getDebugInfo(), this.player.getState(), this.cameraManager.modeLabel, this.vehicle?.getState(), this.driving, this.npcs.getDebugInfo(), this.traffic.getDebugInfo(), { colliders: this.physics.colliderCount, controllers: this.physics.vehicleControllerCount, hz: 1 / this.config.physics.fixedTimeStep, managedVehicles: this.vehicles.count }, { count: this.interactions.count, focused: this.driving ? undefined : this.interactions.focusedId });
    const vehicle = this.vehicle?.getState();
    if (vehicle !== undefined) this.vehicleStatus?.update({
      canEnter: this.interactionContext?.kind === 'vehicleEnter',
      driving: this.driving,
      speedKmh: metersPerSecondToKmh(vehicle.speed),
      worldPrompt: this.driving ? undefined : this.interactions.prompt
    });
  }

  public dispose(): void {
    this.combat.dispose(); this.combatView.dispose(); this.combatHud?.dispose();
    this.moneyHud?.dispose();
    this.gameLoop?.stop();
    this.debugHud?.dispose();
    this.pointerLockHint?.dispose();
    this.vehicleStatus?.dispose();
    this.input.dispose();
    this.cameraManager.dispose();
    this.playerView?.dispose(this.sceneManager.scene);
    this.vehicles.dispose();
    this.npcs.dispose();
    this.traffic.dispose();
    this.interactions.dispose();
    this.player.dispose();
    this.world.dispose();
    this.sceneManager.dispose();
    this.physics.dispose();
    this.renderer?.dispose();
    this.initialized = false;
  }

  private useWorldAction(action: string): boolean {
    if (!import.meta.env.DEV || action !== 'purchase:development') return false;
    const result = this.personalAssets.purchase(developmentOffer);
    const message = result === 'purchased' ? `${developmentOffer.asset.name} alındı · Gardırop kaydı oluşturuldu`
      : result === 'alreadyOwned' ? 'Bu varlığa zaten sahipsin' : 'Yetersiz bakiye';
    this.vehicleStatus?.showFeedback(message, economyConfig.feedbackSeconds);
    return result === 'purchased';
  }

  /** Development fixture only; exercises the same economy APIs, never production input. */
  public developmentEconomy(action: 'credit' | 'debit'): void {
    if (!import.meta.env.DEV) return;
    if (action === 'credit') this.personalAssets.addMoney(100_000);
    else this.personalAssets.spendMoney(this.personalAssets.balance);
  }

  /** QA placement only: approach an existing slow AI car; never spawn/stop/teleport the car. */
  public developmentApproachTraffic(): void {
    if (!import.meta.env.DEV || this.driving) return;
    for (const state of this.traffic.getStates().filter((s) => s.tier === 'active' && s.speed <= this.config.vehicle.interaction.maxEnterSpeed)) {
      const candidate = findSafeExitCandidate(getVehicleExitCandidates(createVehicleState(state.id, state.position, state.yaw), this.config.vehicle), (p) =>
        this.world.isPositionLoaded(p.x, p.z) && this.physics.isCapsulePositionClear([p.x, this.world.getTerrainHeight(p.x,p.z)
          + this.config.player.capsuleHalfHeight + this.config.player.capsuleRadius + this.config.player.controllerOffset, p.z],
          this.config.player.capsuleHalfHeight, this.config.player.capsuleRadius, this.player.getPhysicsBody()));
      if (!candidate) continue;
      this.player.resumeAt(candidate, (x,z) => this.world.getTerrainHeight(x,z));
      this.cameraManager.initialize(this.player.getState(), -state.yaw);
      this.input.clearActionState(); return;
    }
    this.vehicleStatus?.showFeedback('QA: Henüz yavaş trafik aracı yok', 2);
  }

  private requireRenderer(): Renderer {
    if (this.renderer === undefined) throw new Error('Game renderer is not initialized.');
    return this.renderer;
  }

  private requireGameLoop(): GameLoop {
    if (this.gameLoop === undefined) throw new Error('Game loop is not initialized.');
    return this.gameLoop;
  }

  private vehicleDebugVisible = false;

  private getVehicleEnterTarget(): { id: string; traffic: boolean } | undefined {
    const position = this.player.getState().position;
    const parked = this.vehicles.getEnterCandidate(position, this.config.vehicle.interaction)?.getState();
    const traffic = this.traffic.getEnterCandidate(position, this.config.vehicle.interaction);
    const candidates = [...(parked ? [{ state: parked, traffic: false }] : []), ...(traffic ? [{ state: traffic, traffic: true }] : [])];
    candidates.sort((a, b) => Math.hypot(a.state.position.x - position.x, a.state.position.z - position.z)
      - Math.hypot(b.state.position.x - position.x, b.state.position.z - position.z) || a.state.id.localeCompare(b.state.id));
    const target = candidates[0]; return target ? { id: target.state.id, traffic: target.traffic } : undefined;
  }

  private toggleVehicleInteraction(): void {
    const target = this.driving ? undefined : this.getVehicleEnterTarget();
    const vehicle = this.driving ? this.vehicle : target?.traffic
      ? this.traffic.takeOver(target.id, this.player.getState().position, this.config.vehicle, this.vehicles)
      : target ? this.vehicles.getVehicleById(target.id) : undefined;
    if (vehicle === undefined) return;
    if (this.driving) {
      const state = vehicle.getState();
      if (state.speed > this.config.vehicle.interaction.maxExitSpeed) {
        this.vehicleStatus?.showFeedback('Stop vehicle to exit', this.config.vehicle.interaction.exitFeedbackSeconds);
        return;
      }
      const candidate = findSafeExitCandidate(getVehicleExitCandidates(state, this.config.vehicle), (option) => {
        const terrainY = this.world.getTerrainHeight(option.x, option.z);
        const capsuleY = terrainY + this.config.player.capsuleHalfHeight + this.config.player.capsuleRadius + this.config.player.controllerOffset;
        return Number.isFinite(terrainY)
          && capsuleY > this.config.player.killY
          && this.physics.isCapsulePositionClear(
            [option.x, capsuleY, option.z],
            this.config.player.capsuleHalfHeight,
            this.config.player.capsuleRadius,
            vehicle.getBody()
          );
      });
      if (candidate === undefined) {
        this.vehicleStatus?.showFeedback('No safe exit', this.config.vehicle.interaction.exitFeedbackSeconds);
        return;
      }
      this.player.resumeAt(candidate, (x, z) => this.world.getTerrainHeight(x, z));
      this.driving = false;
      vehicle.setOccupied(false);
      this.cameraManager.setVehicleChase(false);
      this.playerView?.setVisible(true);
      this.vehicleStatus?.clearFeedback();
      this.input.clearActionState();
      return;
    }
    if (isVehicleEnterEligible(this.player.getState().position, vehicle.getState(), this.config.vehicle.interaction.enterDistance, this.config.vehicle.interaction.maxEnterSpeed)) {
      this.vehicle = vehicle;
      this.vehicles.setDebugVisible(this.vehicleDebugVisible);
      this.player.suspend();
      this.combat.holster(); this.equipRequested = false; this.reloadRequested = false;
      this.driving = true;
      vehicle.setOccupied(true);
      this.cameraManager.setVehicleChase(true);
      this.playerView?.setVisible(false);
      this.vehicleStatus?.clearFeedback();
      this.input.clearActionState();
    }
  }
}
