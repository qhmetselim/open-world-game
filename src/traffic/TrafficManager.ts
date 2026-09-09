import type { Scene } from 'three';
import type { GameConfig } from '../core/Config';
import type { UrbanMobilityNetwork, VehicleLane } from '../city/UrbanMobility';
import type { PhysicsWorld, VehiclePhysics } from '../physics/PhysicsWorld';
import { hashStringToSeed } from '../world/SeededNoise';
import { SpatialHash } from '../npc/SpatialHash';
import { TrafficVehicleRenderResources, TrafficVehicleView } from '../render/TrafficVehicleView';
import { getSteeringLimit, toRapierSteeringAngle } from '../vehicle/VehicleMovement';
import { IntersectionReservationBook } from './IntersectionReservation';
import { chooseOutgoingLane, desiredTrafficSpeed, followingDesiredSpeed, laneLength, lanePointAtProgress, laneSteering, laneYaw, safeFollowingDistance, shouldBeActive, speedControl } from './TrafficLogic';
import type { TrafficDebugInfo, TrafficVehicleState } from './TrafficTypes';
import { createTrafficIdentity } from './TrafficIdentity';

interface TrafficRecord { readonly state: TrafficVehicleState; physics: VehiclePhysics | undefined; view: TrafficVehicleView | undefined; }

export class TrafficManager {
  private readonly records = new Map<string, TrafficRecord>();
  private readonly spatial: SpatialHash<TrafficVehicleState>;
  private readonly reservations = new IntersectionReservationBook();
  private readonly resources: TrafficVehicleRenderResources;
  private activationCount = 0;
  private deactivationCount = 0;
  private elapsedSeconds = 0;
  private debugEnabled = false;
  public constructor(private readonly scene: Scene, private readonly physics: PhysicsWorld, private readonly config: GameConfig['traffic'], private readonly sedan: GameConfig['vehicle']['sedan'], private readonly seed: string, private readonly terrainHeight: (x: number, z: number) => number) {
    this.spatial = new SpatialHash(config.spatialCellSize);
    this.resources = new TrafficVehicleRenderResources(sedan);
  }

  public fixedUpdate(deltaSeconds: number, focus: { readonly x: number; readonly z: number }, network: UrbanMobilityNetwork, playerVehicle: { readonly x: number; readonly z: number; readonly speed: number } | undefined): void {
    this.elapsedSeconds += deltaSeconds;
    this.reservations.expire(this.elapsedSeconds);
    this.recycleDistantBackground(focus);
    this.ensurePopulation(focus, network);
    const laneById = new Map(network.lanes.map((lane) => [lane.id, lane]));
    let active = [...this.records.values()].filter((record) => record.state.tier === 'active').length;
    let activationsThisUpdate = 0;
    for (const record of [...this.records.values()].sort((a, b) => a.state.id.localeCompare(b.state.id))) {
      const distance = Math.hypot(record.state.position.x - focus.x, record.state.position.z - focus.z);
      const wantsActive = shouldBeActive(distance, this.config.activeRadius, this.config.despawnRadius, record.state.tier === 'active');
      if (record.state.tier === 'background' && wantsActive && active < this.config.maxActive && activationsThisUpdate < this.config.activationBudget) { this.activate(record, laneById); active += 1; activationsThisUpdate += 1; }
      if (record.state.tier === 'active' && !wantsActive) { this.deactivate(record); active -= 1; }
    }
    for (const record of this.records.values()) {
      if (record.state.tier === 'active') this.updateActive(record, laneById, network, playerVehicle, deltaSeconds);
      else this.updateBackground(record, laneById, network, deltaSeconds);
    }
    this.spatial.clear();
    for (const record of this.records.values()) if (record.state.tier === 'active') this.spatial.upsert(record.state);
  }

  public render(): void { for (const record of this.records.values()) record.view?.update(record.state); }
  public getStates(): readonly TrafficVehicleState[] { return [...this.records.values()].map((record) => record.state); }
  public toggleDebug(): void { this.debugEnabled = !this.debugEnabled; this.records.forEach((record) => record.view?.setDebugVisible(this.debugEnabled)); }
  public getNearest(position: { x: number; z: number }, radius: number): TrafficVehicleState | undefined { return [...this.spatial.nearby(position, radius)].sort((a, b) => Math.hypot(a.position.x - position.x, a.position.z - position.z) - Math.hypot(b.position.x - position.x, b.position.z - position.z))[0]; }
  public getDebugInfo(): TrafficDebugInfo {
    const records = [...this.records.values()].map((record) => record.state);
    const count = (activity: TrafficVehicleState['activity']) => records.filter((state) => state.activity === activity).length;
    return { activeCount: records.filter((state) => state.tier === 'active').length, backgroundCount: records.filter((state) => state.tier === 'background').length, renderedCount: records.filter((state) => state.tier === 'active').length, cruisingCount: count('cruising') + count('turning'), followingCount: count('following'), brakingCount: count('braking'), waitingCount: count('waitingIntersection'), controllerCount: records.filter((state) => state.tier === 'active').length, reservationCount: this.reservations.count, activationCount: this.activationCount, deactivationCount: this.deactivationCount, debugEnabled: this.debugEnabled };
  }
  public dispose(): void { for (const record of this.records.values()) this.disposeActive(record); this.records.clear(); this.spatial.clear(); this.resources.dispose(); }

  private ensurePopulation(focus: { x: number; z: number }, network: UrbanMobilityNetwork): void {
    if (this.records.size >= this.config.maxBackground) return;
    const lanes = network.lanes.filter((lane) => laneLength(lane) > 12).sort((a, b) => a.id.localeCompare(b.id));
    for (const lane of lanes) {
      if (this.records.size >= this.config.maxBackground) break;
      const identity = createTrafficIdentity(this.seed, lane.id, this.config.speedVariationMin, this.config.speedVariationMax);
      const id = identity.id;
      if (this.records.has(id)) continue;
      const seed = identity.appearanceSeed;
      const progress = .12 + ((seed >>> 8) % 68) / 100;
      const point = lanePointAtProgress(lane, progress);
      const distance = Math.hypot(point.x - focus.x, point.z - focus.z);
      if (distance < this.config.spawnMinDistance || distance > this.config.spawnMaxDistance) continue;
      const multiplier = identity.speedMultiplier;
      this.records.set(id, { state: { id, appearanceSeed: seed, color: identity.color, laneId: lane.id, nextLaneId: undefined, laneProgress: progress, position: { x: point.x, y: this.terrainHeight(point.x, point.z) + .9, z: point.z }, yaw: laneYaw(lane), speed: 0, desiredSpeed: desiredTrafficSpeed(lane.speedMetadata, multiplier), steering: 0, throttle: 0, brake: 0, wheelRotations: [0, 0, 0, 0], speedMultiplier: multiplier, tier: 'background', activity: 'cruising', backgroundElapsed: 0, reservationId: undefined, stuckSeconds: 0 }, physics: undefined, view: undefined });
    }
  }

  private recycleDistantBackground(focus: { x: number; z: number }): void {
    for (const [id, record] of this.records) {
      if (record.state.tier !== 'background') continue;
      if (Math.hypot(record.state.position.x - focus.x, record.state.position.z - focus.z) <= this.config.despawnRadius * 2) continue;
      this.reservations.release(record.state.reservationId, record.state.id);
      this.records.delete(id);
    }
  }

  private activate(record: TrafficRecord, lanes: ReadonlyMap<string, VehicleLane>): void {
    const lane = lanes.get(record.state.laneId); if (lane === undefined) return;
    const point = lanePointAtProgress(lane, record.state.laneProgress);
    const y = this.terrainHeight(point.x, point.z) + this.sedan.chassisHeight + this.sedan.wheelRadius + this.sedan.suspensionRestLength;
    record.state.position = { x: point.x, y, z: point.z }; record.state.yaw = laneYaw(lane);
    record.physics = this.physics.createVehicle([point.x, y, point.z], record.state.yaw, this.sedan);
    record.view = new TrafficVehicleView(this.scene, this.resources, this.sedan, record.state); record.view.setDebugVisible(this.debugEnabled);
    record.state.tier = 'active'; this.activationCount += 1;
  }

  private deactivate(record: TrafficRecord): void { this.disposeActive(record); record.state.tier = 'background'; this.deactivationCount += 1; }
  private disposeActive(record: TrafficRecord): void { if (record.physics !== undefined) this.physics.removeVehicle(record.physics); record.physics = undefined; if (record.view !== undefined) record.view.dispose(this.scene); record.view = undefined; }

  private updateBackground(record: TrafficRecord, lanes: ReadonlyMap<string, VehicleLane>, network: UrbanMobilityNetwork, deltaSeconds: number): void {
    record.state.backgroundElapsed += deltaSeconds;
    if (record.state.backgroundElapsed < this.config.backgroundUpdateInterval) return;
    const dt = record.state.backgroundElapsed; record.state.backgroundElapsed = 0;
    this.advanceRoute(record, lanes, network, record.state.desiredSpeed * dt);
  }

  private updateActive(record: TrafficRecord, lanes: ReadonlyMap<string, VehicleLane>, network: UrbanMobilityNetwork, playerVehicle: { readonly x: number; readonly z: number; readonly speed: number } | undefined, deltaSeconds: number): void {
    const physics = record.physics; const lane = lanes.get(record.state.laneId); if (physics === undefined || lane === undefined) return;
    const translation = physics.body.translation(); const rotation = physics.body.rotation(); const velocity = physics.body.linvel();
    record.state.position = { x: translation.x, y: translation.y, z: translation.z }; record.state.yaw = Math.atan2(2 * (rotation.w * rotation.y + rotation.x * rotation.z), 1 - 2 * (rotation.y * rotation.y + rotation.z * rotation.z)); record.state.speed = Math.hypot(velocity.x, velocity.z);
    record.state.laneProgress = this.projectProgress(lane, record.state.position);
    const endDistance = (1 - record.state.laneProgress) * laneLength(lane);
    const connection = network.laneConnections.find((candidate) => candidate.incomingLaneId === lane.id && candidate.outgoingLaneId === record.state.nextLaneId)
      ?? network.laneConnections.find((candidate) => candidate.incomingLaneId === lane.id);
    if (record.state.nextLaneId === undefined && connection !== undefined) record.state.nextLaneId = chooseOutgoingLane(lane.id, network.laneConnections, hashStringToSeed(`${record.state.id}:${record.state.laneId}`));
    let targetLane = lane;
    if (record.state.nextLaneId !== undefined && endDistance < this.config.laneLookAhead * 1.5) targetLane = lanes.get(record.state.nextLaneId) ?? lane;
    const intersectionId = connection?.intersectionId;
    let desired = desiredTrafficSpeed(lane.speedMetadata, record.state.speedMultiplier);
    if (intersectionId !== undefined && endDistance < this.config.intersectionStopDistance) {
      if (this.reservations.request(intersectionId, record.state.id, this.elapsedSeconds, this.config.reservationSeconds)) { record.state.reservationId = intersectionId; record.state.activity = 'turning'; }
      else { desired = 0; record.state.activity = 'waitingIntersection'; }
    }
    const front = this.findFront(record.state, lane, playerVehicle);
    const safe = safeFollowingDistance(record.state.speed, this.config.followingDistance, this.config.followingTime);
    desired = followingDesiredSpeed(desired, front?.speed, front?.gap, safe);
    if (front !== undefined && desired < record.state.speed) record.state.activity = desired === 0 ? 'braking' : 'following';
    const target = targetLane === lane ? lanePointAtProgress(lane, Math.min(1, record.state.laneProgress + this.config.laneLookAhead / Math.max(laneLength(lane), 1))) : lanePointAtProgress(targetLane, Math.min(.25, this.config.laneLookAhead / Math.max(laneLength(targetLane), 1)));
    const limit = getSteeringLimit(record.state.speed, this.sedan.maxSteerAngle, this.sedan.highSpeedSteerReduction, this.sedan.maxForwardSpeed);
    record.state.steering = laneSteering(record.state.yaw, target, record.state.position, this.config.steeringGain, limit);
    const control = speedControl(record.state.speed, desired, this.config.throttleGain, this.config.brakeGain);
    record.state.throttle = control.throttle; record.state.brake = control.brake; record.state.desiredSpeed = desired;
    for (let index = 0; index < 4; index += 1) { physics.controller.setWheelEngineForce(index, index >= 2 ? record.state.throttle * this.sedan.engineForce : 0); physics.controller.setWheelBrake(index, record.state.brake * this.sedan.brakeForce); physics.controller.setWheelSteering(index, index < 2 ? toRapierSteeringAngle(record.state.steering) : 0); physics.controller.setWheelFrictionSlip(index, this.sedan.grip); }
    this.physics.updateVehicle(physics, deltaSeconds);
    record.state.wheelRotations = [
      physics.controller.wheelRotation(0) ?? 0, physics.controller.wheelRotation(1) ?? 0,
      physics.controller.wheelRotation(2) ?? 0, physics.controller.wheelRotation(3) ?? 0
    ];
    const flipped = Math.abs(rotation.x) > .65 || Math.abs(rotation.z) > .65;
    if (record.state.activity !== 'waitingIntersection' && record.state.throttle > .45 && record.state.speed < .3) record.state.stuckSeconds += deltaSeconds;
    else record.state.stuckSeconds = 0;
    if (flipped || record.state.stuckSeconds > this.config.reservationTimeoutSeconds) this.recover(record, lane);
    if (record.state.laneProgress > .98 && record.state.nextLaneId !== undefined) { this.advanceRoute(record, lanes, network, 0); this.reservations.release(record.state.reservationId, record.state.id); record.state.reservationId = undefined; }
  }

  private advanceRoute(record: TrafficRecord, lanes: ReadonlyMap<string, VehicleLane>, network: UrbanMobilityNetwork, distance: number): void {
    let lane = lanes.get(record.state.laneId); if (lane === undefined) return;
    record.state.laneProgress += distance / Math.max(laneLength(lane), 1);
    while (record.state.laneProgress >= 1) {
      const next: string | undefined = record.state.nextLaneId ?? chooseOutgoingLane(lane.id, network.laneConnections, hashStringToSeed(`${record.state.id}:${lane.id}`));
      if (next === undefined || lanes.get(next) === undefined) { record.state.laneProgress %= 1; break; }
      record.state.laneId = next; record.state.nextLaneId = undefined; record.state.laneProgress -= 1; lane = lanes.get(next) ?? lane;
    }
    const point = lanePointAtProgress(lane, record.state.laneProgress); record.state.position = { x: point.x, y: this.terrainHeight(point.x, point.z) + .9, z: point.z }; record.state.yaw = laneYaw(lane); record.state.speed = record.state.desiredSpeed;
  }

  private projectProgress(lane: VehicleLane, position: { x: number; z: number }): number { const start = lane.path[0]; const end = lane.path.at(-1); if (start === undefined || end === undefined) return 0; const dx = end.x - start.x; const dz = end.z - start.z; return Math.max(0, Math.min(1, ((position.x - start.x) * dx + (position.z - start.z) * dz) / Math.max(dx * dx + dz * dz, Number.EPSILON))); }
  private recover(record: TrafficRecord, lane: VehicleLane): void {
    const physics = record.physics; if (physics === undefined) return;
    record.state.activity = 'recovering'; record.state.stuckSeconds = 0;
    record.state.laneProgress = Math.min(.92, record.state.laneProgress + .08);
    const point = lanePointAtProgress(lane, record.state.laneProgress);
    const y = this.terrainHeight(point.x, point.z) + this.sedan.chassisHeight + this.sedan.wheelRadius + this.sedan.suspensionRestLength;
    const yaw = laneYaw(lane);
    physics.body.setTranslation({ x: point.x, y, z: point.z }, true);
    physics.body.setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) }, true);
    physics.body.setLinvel({ x: 0, y: 0, z: 0 }, true); physics.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
  }
  private findFront(state: TrafficVehicleState, lane: VehicleLane, player: { readonly x: number; readonly z: number; readonly speed: number } | undefined): { speed: number; gap: number } | undefined {
    const forward = { x: Math.sin(state.yaw), z: Math.cos(state.yaw) }; let nearest: { speed: number; gap: number } | undefined;
    for (const other of this.spatial.nearby(state.position, 45)) { if (other.id === state.id) continue; const dx = other.position.x - state.position.x; const dz = other.position.z - state.position.z; const along = dx * forward.x + dz * forward.z; const lateral = Math.abs(dx * -forward.z + dz * forward.x); if (along > 0 && lateral < this.sedan.chassisWidth && (nearest === undefined || along < nearest.gap)) nearest = { speed: other.speed, gap: along }; }
    if (player !== undefined) { const dx = player.x - state.position.x; const dz = player.z - state.position.z; const along = dx * forward.x + dz * forward.z; const lateral = Math.abs(dx * -forward.z + dz * forward.x); if (along > 0 && lateral < this.sedan.chassisWidth && (nearest === undefined || along < nearest.gap)) nearest = { speed: player.speed, gap: along }; }
    void lane; return nearest;
  }
}
