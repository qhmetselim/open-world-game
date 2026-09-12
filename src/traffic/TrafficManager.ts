import type { Scene } from 'three';
import type { GameConfig } from '../core/Config';
import type { UrbanMobilityNetwork, VehicleLane, LaneConnection } from '../city/UrbanMobility';
import type { PhysicsWorld, VehiclePhysics } from '../physics/PhysicsWorld';
import { MotionHistory, rotationYaw } from '../physics/MotionHistory';
import { hashStringToSeed } from '../world/SeededNoise';
import { SpatialHash } from '../npc/SpatialHash';
import { TrafficVehicleRenderResources, TrafficVehicleView } from '../render/TrafficVehicleView';
import { getSteeringLimit, toRapierSteeringAngle } from '../vehicle/VehicleMovement';
import { IntersectionReservationBook } from './IntersectionReservation';
import { chooseOutgoingLane, desiredTrafficSpeed, laneLength, lanePointAtProgress, laneYaw, shouldBeActive, speedControl } from './TrafficLogic';
import type { TrafficDebugInfo, TrafficVehicleState } from './TrafficTypes';
import { createTrafficIdentity } from './TrafficIdentity';
import { buildTrafficPath, pathLength, projectPath, pursuitSteering, reacquireForwardLane, samplePath } from './TrafficPath';
import { validateTrafficSpawn } from './TrafficSpawn';
import type { TrafficRoadValidation } from './TrafficSpawn';

interface TrafficRecord {
  readonly state: TrafficVehicleState;
  readonly motion: MotionHistory;
  physics: VehiclePhysics | undefined;
  view: TrafficVehicleView | undefined;
  path: ReturnType<typeof buildTrafficPath>;
  pathKey: string;
  previousProgress: number;
  retryAt: number;
  failedActivations: number;
  recoveryTime: number;
  recoveryAttempts: number;
  spinTime: number;
  age: number;
}
interface TrafficObstacle { readonly x: number; readonly z: number; readonly speed: number }

export class TrafficManager {
  private readonly records = new Map<string, TrafficRecord>();
  private readonly spatial: SpatialHash<TrafficVehicleState>;
  private readonly reservations = new IntersectionReservationBook();
  private readonly resources: TrafficVehicleRenderResources;
  private network: UrbanMobilityNetwork | undefined;
  private lanes = new Map<string, VehicleLane>();
  private activationCount = 0;
  private deactivationCount = 0;
  private elapsedSeconds = 0;
  private debugEnabled = false;
  private rejectedSpawns = 0;
  private recoveryCount = 0;
  private spinCount = 0;
  public constructor(private readonly scene: Scene, private readonly physics: PhysicsWorld, private readonly config: GameConfig['traffic'], private readonly sedan: GameConfig['vehicle']['sedan'], private readonly seed: string, private readonly terrainHeight: (x: number, z: number) => number,
    private readonly roadValid: TrafficRoadValidation = () => true) {
    this.spatial = new SpatialHash(config.spatialCellSize);
    this.resources = new TrafficVehicleRenderResources(sedan);
  }

  public fixedUpdate(dt: number, focus: { readonly x: number; readonly z: number }, network: UrbanMobilityNetwork, playerVehicle: TrafficObstacle | undefined): void {
    this.elapsedSeconds += dt;
    this.reservations.expire(this.elapsedSeconds);
    if (this.network !== network) { this.network = network; this.lanes = new Map(network.lanes.map((lane) => [lane.id, lane])); }
    this.syncFromPhysics();
    for (const [id, record] of this.records) {
      const distance = Math.hypot(record.state.position.x - focus.x, record.state.position.z - focus.z);
      const lane = this.lanes.get(record.state.laneId);
      if (record.physics && (distance > this.config.despawnRadius || !lane || !this.roadValid(lane, record.state.position.x, record.state.position.z))) this.deactivate(record);
      if (!record.physics && record.state.laneProgress >= .94 && !this.network?.laneConnections.some((c) => c.incomingLaneId === record.state.laneId)
        && distance > this.config.spawnMinDistance * 2) { this.records.delete(id); continue; }
      if (!record.physics && distance > this.config.despawnRadius * 2) { this.reservations.release(record.state.reservationId, id); this.records.delete(id); }
    }
    this.ensurePopulation(focus);
    let active = this.getDebugInfo().activeCount;
    let activations = 0;
    for (const record of this.records.values()) {
      const distance = Math.hypot(record.state.position.x - focus.x, record.state.position.z - focus.z);
      if (!record.physics && active < this.config.maxActive && activations < this.config.activationBudget && this.elapsedSeconds >= record.retryAt
        && distance >= this.config.spawnMinDistance && shouldBeActive(distance, this.config.activeRadius, this.config.despawnRadius, false)) {
        if (this.activate(record, focus, playerVehicle)) { active++; activations++; }
        else { this.rejectedSpawns++; record.retryAt = this.elapsedSeconds + Math.min(1, .1 * 2 ** Math.min(4, record.failedActivations++)); }
      }
    }
    this.spatial.clear();
    for (const record of this.records.values()) if (record.physics) this.spatial.upsert(record.state);
    for (const record of this.records.values()) {
      if (record.physics) this.updateActive(record, focus, playerVehicle, dt);
      else this.updateBackground(record, dt);
    }
  }

  public syncFromPhysics(): void {
    for (const record of this.records.values()) {
      const vehicle = record.physics; if (!vehicle) continue;
      const p = vehicle.body.translation(); const q = vehicle.body.rotation(); const v = vehicle.body.linvel();
      record.state.position = { ...p }; record.state.rotation = { ...q }; record.state.yaw = rotationYaw(q);
      record.state.speed = Math.hypot(v.x, v.z);
      record.state.forwardSpeed = v.x * Math.sin(record.state.yaw) + v.z * Math.cos(record.state.yaw);
      record.state.wheelContactCount = 0;
      for (let i = 0; i < 4; i++) if (vehicle.controller.wheelIsInContact(i)) record.state.wheelContactCount++;
      record.state.wheelRotations = [0, 1, 2, 3].map((i) => vehicle.controller.wheelRotation(i) ?? 0) as [number, number, number, number];
      record.state.suspensionLengths = [0, 1, 2, 3].map((i) => vehicle.controller.wheelSuspensionLength(i) ?? this.sedan.suspensionRestLength);
    }
  }
  public render(alpha = 1): void {
    for (const record of this.records.values()) if (record.view) record.view.update({ ...record.state, ...record.motion.sample(alpha) });
  }
  public captureAfterStep(): void {
    this.syncFromPhysics();
    for (const record of this.records.values()) if (record.physics) record.motion.capture(record.state.position, record.state.rotation);
  }
  public getStates(): readonly TrafficVehicleState[] { return [...this.records.values()].map((record) => record.state); }
  public toggleDebug(): void { this.debugEnabled = !this.debugEnabled; this.records.forEach((record) => record.view?.setDebugVisible(this.debugEnabled)); }
  public getNearest(position: { x: number; z: number }, radius: number): TrafficVehicleState | undefined {
    return [...this.spatial.nearby(position, radius)].sort((a, b) => Math.hypot(a.position.x - position.x, a.position.z - position.z) - Math.hypot(b.position.x - position.x, b.position.z - position.z))[0];
  }
  public getDebugInfo(): TrafficDebugInfo {
    const all = [...this.records.values()]; const active = all.filter((record) => record.physics);
    const count = (activity: TrafficVehicleState['activity']) => active.filter((r) => r.state.activity === activity).length;
    return { activeCount: active.length, backgroundCount: all.length - active.length, renderedCount: active.length, cruisingCount: count('cruising') + count('turning'), followingCount: count('following'), brakingCount: count('braking'), waitingCount: count('waitingIntersection'), controllerCount: active.length, reservationCount: this.reservations.count, activationCount: this.activationCount, deactivationCount: this.deactivationCount, debugEnabled: this.debugEnabled,
      rejectedSpawns: this.rejectedSpawns, recoveryCount: this.recoveryCount, spinCount: this.spinCount, recoveringCount: count('recovering'), routeTransitions: all.reduce((sum, r) => sum + r.state.routeTransitions, 0) };
  }
  public dispose(): void { for (const record of this.records.values()) this.deactivate(record); this.records.clear(); this.spatial.clear(); this.reservations.clear(); this.lanes.clear(); this.network = undefined; this.resources.dispose(); }

  private ensurePopulation(focus: { x: number; z: number }): void {
    for (const lane of this.lanes.values()) {
      if (this.records.size >= this.config.maxBackground) break;
      const identity = createTrafficIdentity(this.seed, lane.id, this.config.speedVariationMin, this.config.speedVariationMax);
      if (this.records.has(identity.id) || laneLength(lane) < this.config.spawnEndpointMargin * 2) continue;
      const margin = this.config.spawnEndpointMargin / laneLength(lane);
      const progress = Math.max(margin, Math.min(1 - margin, .12 + ((identity.appearanceSeed >>> 8) % 68) / 100));
      const p = lanePointAtProgress(lane, progress); const distance = Math.hypot(p.x - focus.x, p.z - focus.z);
      if (distance < this.config.spawnMinDistance || distance > this.config.spawnMaxDistance) continue;
      const yaw = laneYaw(lane);
      const state: TrafficVehicleState = { id: identity.id, appearanceSeed: identity.appearanceSeed, color: identity.color, laneId: lane.id, nextLaneId: undefined, laneProgress: progress, position: { ...p, y: this.terrainHeight(p.x, p.z) }, yaw, rotation: { x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) }, speed: 0, forwardSpeed: 0, wheelContactCount: 0, suspensionLengths: [], routeTransitions: 0, desiredSpeed: desiredTrafficSpeed(lane.speedMetadata, identity.speedMultiplier), steering: 0, throttle: 0, brake: 0, wheelRotations: [0, 0, 0, 0], speedMultiplier: identity.speedMultiplier, tier: 'background', activity: 'cruising', backgroundElapsed: 0, reservationId: undefined, stuckSeconds: 0 };
      this.records.set(state.id, { state, motion: new MotionHistory(), physics: undefined, view: undefined, path: [], pathKey: '', previousProgress: 0, retryAt: 0, failedActivations: 0, recoveryTime: 0, recoveryAttempts: 0, spinTime: 0, age: 0 });
    }
  }
  private activate(record: TrafficRecord, focus: { x: number; z: number }, player: TrafficObstacle | undefined): boolean {
    const lane = this.lanes.get(record.state.laneId); if (!lane) return false;
    const spawn = validateTrafficSpawn(lane, record.state.laneProgress, this.physics, this.sedan, this.config, this.terrainHeight, this.roadValid);
    if (!spawn || Math.hypot(spawn.position.x - focus.x, spawn.position.z - focus.z) < this.config.spawnMinDistance) return false;
    if (player && Math.hypot(spawn.position.x - player.x, spawn.position.z - player.z) < this.sedan.chassisLength + this.config.followingDistance) return false;
    for (const other of this.records.values()) if (other.physics && Math.hypot(other.state.position.x - spawn.position.x, other.state.position.z - spawn.position.z) < this.sedan.chassisLength + 2) return false;
    record.physics = this.physics.createVehicle([spawn.position.x, spawn.position.y, spawn.position.z], spawn.yaw, this.sedan, true);
    const speed = Math.min(record.state.speed, this.config.turnSpeed);
    record.physics.body.setLinvel({ x: Math.sin(spawn.yaw) * speed, y: 0, z: Math.cos(spawn.yaw) * speed }, true);
    record.physics.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    record.state.position = spawn.position; record.state.yaw = spawn.yaw; record.state.rotation = { ...record.physics.body.rotation() };
    record.motion.reset(spawn.position, record.state.rotation);
    record.view = new TrafficVehicleView(this.scene, this.resources, this.sedan, record.state); record.view.setDebugVisible(this.debugEnabled);
    record.state.tier = 'active'; record.age = 0; record.pathKey = ''; record.recoveryTime = 0; record.recoveryAttempts = 0; record.failedActivations = 0; this.activationCount++;
    return true;
  }
  private deactivate(record: TrafficRecord): void {
    if (!record.physics) return;
    this.reservations.release(record.state.reservationId, record.state.id); record.state.reservationId = undefined;
    this.physics.removeVehicle(record.physics); record.physics = undefined;
    record.view?.dispose(this.scene); record.view = undefined;
    this.spatial.remove(record.state.id); record.state.tier = 'background'; record.retryAt = this.elapsedSeconds + 2; this.deactivationCount++;
  }
  private selectRoute(record: TrafficRecord, lane: VehicleLane): { next: VehicleLane | undefined; connection: LaneConnection | undefined } {
    if (!record.state.nextLaneId) record.state.nextLaneId = chooseOutgoingLane(lane.id, this.network?.laneConnections ?? [], hashStringToSeed(`${record.state.id}:${lane.id}:${record.state.routeTransitions}`));
    const next = record.state.nextLaneId ? this.lanes.get(record.state.nextLaneId) : undefined;
    const connection = this.network?.laneConnections.find((c) => c.incomingLaneId === lane.id && c.outgoingLaneId === next?.id);
    return { next, connection };
  }
  private updateBackground(record: TrafficRecord, dt: number): void {
    record.state.backgroundElapsed += dt;
    if (record.state.backgroundElapsed < this.config.backgroundUpdateInterval) return;
    const lane = this.lanes.get(record.state.laneId); if (!lane) return;
    const distance = desiredTrafficSpeed(lane.speedMetadata, record.state.speedMultiplier) * record.state.backgroundElapsed;
    record.state.backgroundElapsed = 0;
    const { next } = this.selectRoute(record, lane);
    record.state.laneProgress += distance / laneLength(lane);
    if (record.state.laneProgress >= 1 && next) { record.state.laneId = next.id; record.state.laneProgress = 0; record.state.nextLaneId = undefined; record.state.routeTransitions++; }
    else record.state.laneProgress = Math.min(.95, record.state.laneProgress);
    const current = this.lanes.get(record.state.laneId)!; const p = lanePointAtProgress(current, record.state.laneProgress);
    record.state.position = { ...p, y: this.terrainHeight(p.x, p.z) }; record.state.yaw = laneYaw(current);
  }
  private updateActive(record: TrafficRecord, focus: { x: number; z: number }, player: TrafficObstacle | undefined, dt: number): void {
    const vehicle = record.physics; const lane = this.lanes.get(record.state.laneId); if (!vehicle || !lane) return;
    record.age += dt;
    const { next, connection } = this.selectRoute(record, lane);
    const key = `${lane.id}>${next?.id ?? ''}`;
    if (record.pathKey !== key) { record.path = buildTrafficPath(lane, next, this.config.intersectionStopDistance); record.pathKey = key; record.previousProgress = projectPath(record.path, record.state.position).distance; }
    const projection = projectPath(record.path, record.state.position); const length = pathLength(record.path);
    record.state.laneProgress = Math.min(1, projectPath(lane.path, record.state.position).distance / laneLength(lane));
    const endDistance = laneLength(lane) - projectPath(lane.path, record.state.position).distance;
    let desired = desiredTrafficSpeed(lane.speedMetadata, record.state.speedMultiplier);
    record.state.activity = 'cruising';
    const isJunction = connection && this.network?.intersections.some((i) => i.id === connection.intersectionId);
    if (next && connection?.turn !== 'straight' && endDistance < 28) desired = Math.min(desired, this.config.turnSpeed);
    if (isJunction && endDistance < 30) {
      if (this.reservations.request(connection.intersectionId, record.state.id, this.elapsedSeconds, this.config.reservationSeconds)) {
        record.state.reservationId = connection.intersectionId; record.state.activity = 'turning';
      } else {
        const stopGap = Math.max(0, endDistance - this.config.intersectionStopDistance);
        desired = Math.min(desired, Math.sqrt(2 * this.config.brakingDeceleration * stopGap));
        record.state.activity = 'waitingIntersection';
      }
    }
    if (!next) desired = Math.min(desired, Math.sqrt(2 * this.config.brakingDeceleration * Math.max(0, endDistance - this.config.spawnEndpointMargin)));
    const front = this.findFront(record.state, player);
    if (front) {
      const freeGap = Math.max(0, front.gap - this.sedan.chassisLength - this.config.followingDistance);
      const safe = Math.max(0, Math.min(front.speed + freeGap / this.config.followingTime, Math.sqrt(front.speed ** 2 + 2 * this.config.brakingDeceleration * freeGap)));
      if (safe < desired) { desired = safe; record.state.activity = safe < record.state.speed ? 'braking' : 'following'; }
    }
    const lookAhead = this.config.laneLookAhead + record.state.speed * this.config.lookAheadSpeedFactor;
    const target = samplePath(record.path, Math.min(length, projection.distance + lookAhead));
    const limit = getSteeringLimit(record.state.speed, this.sedan.maxSteerAngle, this.sedan.highSpeedSteerReduction, this.sedan.maxForwardSpeed);
    const pursuit = pursuitSteering(record.state.yaw, record.state.position, target, this.sedan.wheelBase, limit);
    const meaningfulProgress = projection.distance - record.previousProgress;
    const spin = Math.abs(vehicle.body.angvel().y) > 1.2 && meaningfulProgress < .02 && record.state.speed < 4;
    record.spinTime = spin ? record.spinTime + dt : Math.max(0, record.spinTime - dt);
    record.state.stuckSeconds = desired > 1 && record.state.speed < .3 && record.age > 1 ? record.state.stuckSeconds + dt : 0;
    const q = record.state.rotation; const upY = 1 - 2 * (q.x * q.x + q.z * q.z);
    if (record.recoveryTime === 0 && (record.spinTime >= this.config.spinSeconds || record.state.stuckSeconds > this.config.reservationTimeoutSeconds || pursuit.behind || upY < .3 || projection.lateralError > 6)) {
      record.recoveryTime = dt; this.recoveryCount++; if (record.spinTime >= this.config.spinSeconds) this.spinCount++;
    }
    let steering = pursuit.steering;
    if (record.age < .35 || record.state.wheelContactCount < 2) desired = 0;
    if (record.recoveryTime > 0) {
      record.state.activity = 'recovering'; desired = 0; steering = 0; record.recoveryTime += dt;
      // Never teleport an active chassis. Settle, reacquire a forward path, or recycle outside visibility.
      const reacquired = record.recoveryTime > this.config.recoverySettleSeconds && record.state.speed < .3 && upY > .8
        && record.recoveryAttempts === 0 && (!front || front.gap > this.sedan.chassisLength + this.config.followingDistance)
        ? reacquireForwardLane(next ? [lane, next] : [lane], record.state.position, record.state.yaw) : undefined;
      if (reacquired) {
        this.reservations.release(record.state.reservationId, record.state.id); record.state.reservationId = undefined;
        record.state.laneId = reacquired.id; record.state.nextLaneId = undefined; record.pathKey = '';
        record.recoveryAttempts++; record.recoveryTime = 0; record.spinTime = 0; record.state.stuckSeconds = 0; record.age = 0;
      } else if (record.recoveryTime > this.config.reservationTimeoutSeconds && Math.hypot(record.state.position.x - focus.x, record.state.position.z - focus.z) > this.config.spawnMinDistance * 2) { this.deactivate(record); return; }
    }
    record.state.steering += (steering - record.state.steering) * (1 - Math.exp(-this.sedan.steerResponse * dt));
    const control = speedControl(record.state.forwardSpeed, desired, this.config.throttleGain, this.config.brakeGain);
    record.state.throttle = desired < .05 ? 0 : control.throttle;
    record.state.brake = desired < .05 ? 1 : control.brake; record.state.desiredSpeed = desired;
    for (let i = 0; i < 4; i++) {
      vehicle.controller.setWheelEngineForce(i, i >= 2 ? record.state.throttle * this.sedan.engineForce : 0);
      vehicle.controller.setWheelBrake(i, record.state.brake * this.sedan.brakeForce);
      vehicle.controller.setWheelSteering(i, i < 2 ? toRapierSteeringAngle(record.state.steering) : 0);
      vehicle.controller.setWheelFrictionSlip(i, this.sedan.grip);
    }
    this.physics.updateVehicle(vehicle, dt);
    record.previousProgress = projection.distance;
    if (next && projection.distance > length - 1 && projection.lateralError < 2) {
      record.state.laneId = next.id; record.state.nextLaneId = undefined; record.state.routeTransitions++;
      record.recoveryAttempts = 0;
      record.state.laneProgress = projectPath(next.path, record.state.position).distance / laneLength(next);
      this.reservations.release(record.state.reservationId, record.state.id); record.state.reservationId = undefined;
    }
  }
  private findFront(state: TrafficVehicleState, player: TrafficObstacle | undefined): { speed: number; gap: number } | undefined {
    let nearest: { speed: number; gap: number } | undefined;
    const consider = (x: number, z: number, speed: number) => {
      const dx = x - state.position.x; const dz = z - state.position.z;
      const along = dx * Math.sin(state.yaw) + dz * Math.cos(state.yaw);
      const lateral = Math.abs(dx * Math.cos(state.yaw) - dz * Math.sin(state.yaw));
      if (along > 0 && lateral < this.sedan.chassisWidth && (!nearest || along < nearest.gap)) nearest = { speed, gap: along };
    };
    for (const other of this.spatial.nearby(state.position, 50)) if (other.id !== state.id) consider(other.position.x, other.position.z, other.speed);
    if (player) consider(player.x, player.z, player.speed);
    return nearest;
  }
}
