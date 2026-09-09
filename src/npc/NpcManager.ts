import type { Scene } from 'three';
import type { GameConfig } from '../core/Config';
import type { UrbanMobilityNetwork } from '../city/UrbanMobility';
import type { WorldPosition } from '../world/ChunkCoord';
import { hashStringToSeed } from '../world/SeededNoise';
import { NpcRenderResources, NpcView } from '../render/NpcView';
import { createNpcAppearance, createNpcIdentity } from './NpcIdentity';
import { stepNpcTowardWaypoint, shouldActivateNpc } from './NpcMovement';
import { findPedestrianPath } from './PedestrianPathfinding';
import { SpatialHash } from './SpatialHash';
import type { NpcIdentity, NpcState } from './NpcTypes';

export interface NpcDebugInfo { readonly activeCount: number; readonly backgroundCount: number; readonly renderedCount: number; readonly walkingCount: number; readonly idleCount: number; readonly spatialCellCount: number; readonly activationCount: number; readonly deactivationCount: number; readonly debugEnabled: boolean; }

interface NpcRecord { readonly identity: NpcIdentity; readonly state: NpcState; view: NpcView | undefined; }

export class NpcManager {
  private readonly records = new Map<string, NpcRecord>();
  private readonly spatial: SpatialHash<NpcState>;
  private readonly resources = new NpcRenderResources();
  private activationCount = 0;
  private deactivationCount = 0;
  private debugEnabled = false;
  public constructor(private readonly scene: Scene, private readonly config: GameConfig['npc'], private readonly worldSeed: string, private readonly getHeight: (x: number, z: number) => number) { this.spatial = new SpatialHash(config.spatialCellSize); }
  public fixedUpdate(deltaSeconds: number, focus: WorldPosition, network: UrbanMobilityNetwork): void {
    this.refreshPopulation(focus, network);
    const nodes = new Map(network.pedestrianNodes.map((node) => [node.id, node]));
    const ordered = [...this.records.values()].sort((left, right) => left.state.id.localeCompare(right.state.id));
    let activeCount = ordered.filter((record) => record.state.tier === 'active').length;
    for (const record of ordered) {
      const state = record.state; const distance = Math.hypot(state.position.x - focus.x, state.position.z - focus.z);
      const active = shouldActivateNpc(distance, this.config.activeRadius, this.config.deactivateRadius, state.tier === 'active') && (state.tier === 'active' || activeCount < this.config.maxActive);
      if (active && state.tier === 'background') { state.tier = 'active'; this.ensureView(record); this.activationCount += 1; activeCount += 1; }
      if (!active && state.tier === 'active') { state.tier = 'background'; record.view?.dispose(); record.view = undefined; this.spatial.remove(state.id); this.deactivationCount += 1; }
      if (state.tier === 'active') this.spatial.upsert(state);
      else {
        state.backgroundElapsed += deltaSeconds;
        if (state.backgroundElapsed >= this.config.backgroundUpdateInterval) {
          state.backgroundElapsed = 0;
          state.tripIndex += 1;
        }
      }
    }
    for (const record of ordered) if (record.state.tier === 'active') this.advance(record, nodes, network, focus, deltaSeconds);
    for (const record of ordered) if (record.state.tier === 'active') this.spatial.upsert(record.state);
  }
  public render(deltaSeconds: number): void { for (const record of this.records.values()) record.view?.update(record.state, deltaSeconds); }
  public toggleDebug(): void { this.debugEnabled = !this.debugEnabled; this.records.forEach((record) => record.view?.setDebugVisible(this.debugEnabled)); }
  public getDebugInfo(): NpcDebugInfo { const values = [...this.records.values()]; return { activeCount: values.filter((record) => record.state.tier === 'active').length, backgroundCount: values.filter((record) => record.state.tier === 'background').length, renderedCount: values.filter((record) => record.view !== undefined).length, walkingCount: values.filter((record) => record.state.activity === 'walking').length, idleCount: values.filter((record) => record.state.activity === 'idle').length, spatialCellCount: this.spatial.cellCount, activationCount: this.activationCount, deactivationCount: this.deactivationCount, debugEnabled: this.debugEnabled }; }
  public getNearestNpc(position: WorldPosition, maxDistance: number): NpcState | undefined { return [...this.spatial.nearby(position, maxDistance)].sort((left, right) => Math.hypot(left.position.x - position.x, left.position.z - position.z) - Math.hypot(right.position.x - position.x, right.position.z - position.z))[0]; }
  public dispose(): void { this.records.forEach((record) => record.view?.dispose()); this.records.clear(); this.spatial.clear(); this.resources.dispose(); }
  private refreshPopulation(focus: WorldPosition, network: UrbanMobilityNetwork): void {
    for (let index = 0; index < network.pedestrianNodes.length; index += this.config.populationNodeStride) {
      const node = network.pedestrianNodes[index]; if (node === undefined) continue;
      const id = `npc:${node.id}`; if (this.records.has(id)) continue;
      const identity = createNpcIdentity(this.worldSeed, id, node.roadId, this.config.walkSpeedMin, this.config.walkSpeedMax);
      this.records.set(id, { identity, view: undefined, state: { id, position: { x: node.position.x, y: this.getHeight(node.position.x, node.position.z), z: node.position.z }, facingYaw: 0, currentNodeId: node.id, destinationNodeId: undefined, pathNodeIds: [node.id], pathIndex: 0, activity: 'idle', tier: 'background', idleRemaining: 0.5 + (hashStringToSeed(id) % 1000) / 1000, tripIndex: 0, backgroundElapsed: 0, appearance: createNpcAppearance(identity.appearanceSeed) } });
    }
    for (const [id, record] of this.records) if (Math.hypot(record.state.position.x - focus.x, record.state.position.z - focus.z) > this.config.deactivateRadius + this.config.activeRadius) { record.view?.dispose(); this.spatial.remove(id); this.records.delete(id); }
  }
  private advance(record: NpcRecord, nodes: ReadonlyMap<string, UrbanMobilityNetwork['pedestrianNodes'][number]>, network: UrbanMobilityNetwork, focus: WorldPosition, deltaSeconds: number): void {
    const state = record.state;
    if (state.activity === 'idle') { state.idleRemaining -= deltaSeconds; if (state.idleRemaining > 0) return; this.planNextPath(record, network); }
    const waypointId = state.pathNodeIds[state.pathIndex + 1]; const waypoint = waypointId === undefined ? undefined : nodes.get(waypointId);
    if (waypoint === undefined) { state.activity = 'idle'; state.idleRemaining = this.idleDuration(state); return; }
    const reached = stepNpcTowardWaypoint(state, waypoint, record.identity.walkSpeed, this.config.waypointReachDistance, deltaSeconds);
    this.applySeparation(state, focus, deltaSeconds);
    if (reached) { state.pathIndex += 1; if (state.pathIndex >= state.pathNodeIds.length - 1) { state.activity = 'idle'; state.idleRemaining = this.idleDuration(state); state.tripIndex += 1; } }
  }
  private planNextPath(record: NpcRecord, network: UrbanMobilityNetwork): void {
    const state = record.state; const candidates = network.pedestrianNodes.filter((node) => node.id !== state.currentNodeId).sort((left, right) => left.id.localeCompare(right.id));
    if (candidates.length === 0) return;
    const startIndex = hashStringToSeed(`${state.id}:${state.tripIndex}`) % candidates.length;
    for (let offset = 0; offset < candidates.length; offset += 1) {
      const destination = candidates[(startIndex + offset) % candidates.length];
      if (destination === undefined) continue;
      const path = findPedestrianPath(state.currentNodeId, destination.id, network.pedestrianNodes, network.pedestrianConnections);
      if (path === undefined || path.length < 2) continue;
      state.destinationNodeId = destination.id; state.pathNodeIds = [...path]; state.pathIndex = 0; state.activity = 'walking';
      return;
    }
    state.idleRemaining = this.idleDuration(state);
  }
  private applySeparation(state: NpcState, focus: WorldPosition, deltaSeconds: number): void {
    for (const neighbor of this.spatial.nearby(state.position, this.config.separationRadius)) {
      if (neighbor.id === state.id) continue; const dx = state.position.x - neighbor.position.x; const dz = state.position.z - neighbor.position.z; const distance = Math.hypot(dx, dz); if (distance > 0.001) { const factor = (1 - distance / this.config.separationRadius) * this.config.separationStrength * deltaSeconds; state.position.x += dx / distance * factor; state.position.z += dz / distance * factor; }
    }
    const dx = state.position.x - focus.x; const dz = state.position.z - focus.z; const distance = Math.hypot(dx, dz); if (distance > 0.01 && distance < 1) { state.position.x += dx / distance * deltaSeconds; state.position.z += dz / distance * deltaSeconds; }
  }
  private ensureView(record: NpcRecord): void { if (record.view === undefined) { record.view = new NpcView(this.scene, this.resources, record.identity, record.state); record.view.setDebugVisible(this.debugEnabled); } }
  private idleDuration(state: NpcState): number { const value = hashStringToSeed(`${state.id}:idle:${state.tripIndex}`) / 0xffff_ffff; return this.config.idleSecondsMin + value * (this.config.idleSecondsMax - this.config.idleSecondsMin); }
}
