import { LineBasicMaterial, MeshStandardMaterial, PointsMaterial } from 'three';
import type { Scene } from 'three';
import type { GameConfig } from '../core/Config';
import type { PhysicsWorld } from '../physics/PhysicsWorld';
import {
  calculateActiveChunkCoords,
  isOutsideUnloadRadius,
  StreamingFocusTracker
} from './ChunkStreaming';
import type { ChunkCoord, WorldPosition } from './ChunkCoord';
import { chunkCoordKey, worldPositionToChunkCoord } from './ChunkCoord';
import { TerrainGenerator } from './TerrainGenerator';
import { TerrainChunkView } from './TerrainChunkView';
import type { StreamingFocus } from './ChunkStreaming';
import { CityLayoutCache } from '../city/CityLayoutCache';
import { RoadChunkView } from '../city/RoadChunkView';
import { MobilityChunkView } from '../city/MobilityChunkView';
import type { CityRegionCoord } from '../city/CityTypes';
import { resolveRoadSegment } from '../city/CityTypes';
import { BuildingLayoutCache } from '../buildings/BuildingLayoutCache';
import type { BuildingData } from '../buildings/BuildingTypes';
import { BuildingChunkView } from '../render/BuildingChunkView';
import { BuildingRenderResources } from '../render/BuildingRenderResources';
import { buildUrbanMobilityNetwork, findNearestLane, findNearestPedestrianNode } from '../city/UrbanMobility';
import type { IntersectionData, PedestrianConnection, UrbanMobilityNetwork, VehicleLane } from '../city/UrbanMobility';

interface ActiveChunk {
  readonly coord: ChunkCoord;
  readonly view: TerrainChunkView;
  readonly roadView: RoadChunkView | undefined;
  readonly mobilityView: MobilityChunkView | undefined;
  readonly buildingView: BuildingChunkView | undefined;
  readonly buildingBodies: readonly ReturnType<PhysicsWorld['createStaticCuboid']>[];
  readonly physicsBody: ReturnType<PhysicsWorld['createStaticTerrainCollider']>;
}

export interface CityDebugInfo {
  readonly currentRegion: CityRegionCoord;
  readonly isUrban: boolean;
  readonly activeRoadChunkViewCount: number;
  readonly visibleRoadSegmentCount: number;
  readonly roadNodeCount: number;
  readonly roadSegmentCount: number;
  readonly cityBlockCount: number;
  readonly parcelCount: number;
  readonly cachedRegionCount: number;
  readonly roadGraphDebugEnabled: boolean;
  readonly activeBuildingChunkViewCount: number;
  readonly visibleBuildingCount: number;
  readonly buildingColliderCount: number;
  readonly windowInstanceCount: number;
  readonly buildingDrawCallCount: number;
  readonly currentRegionBuildingCount: number;
  readonly buildingGraphDebugEnabled: boolean;
  readonly activeLaneCount: number;
  readonly activeIntersectionCount: number;
  readonly activeSidewalkSegmentCount: number;
  readonly activePedestrianNodeCount: number;
  readonly activeCrossingCount: number;
}

export interface WorldStreamingDebugInfo {
  readonly seed: string;
  readonly focusPosition: WorldPosition;
  readonly currentChunk: ChunkCoord | undefined;
  readonly activeChunkCount: number;
  readonly generatedChunkCount: number;
  readonly chunkLoadCount: number;
  readonly chunkUnloadCount: number;
  readonly city: CityDebugInfo;
}

export class World {
  private readonly terrainGenerator: TerrainGenerator;
  private readonly focusTracker = new StreamingFocusTracker();
  private readonly activeChunks = new Map<string, ActiveChunk>();
  private readonly terrainMaterial = new MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0 });
  private readonly roadMaterial = new MeshStandardMaterial({ color: 0x292d30, roughness: 0.96, metalness: 0 });
  private readonly sidewalkMaterial = new MeshStandardMaterial({ color: 0x9ca1a0, roughness: 0.94, metalness: 0 });
  private readonly curbMaterial = new MeshStandardMaterial({ color: 0xd1d2ca, roughness: 0.92, metalness: 0 });
  private readonly markingMaterial = new MeshStandardMaterial({ color: 0xe8dfbd, roughness: 0.88, metalness: 0 });
  private readonly borderMaterial: LineBasicMaterial | undefined;
  private readonly roadGraphLineMaterial: LineBasicMaterial | undefined;
  private readonly roadGraphPointMaterial: PointsMaterial | undefined;
  private readonly mobilityDebugLineMaterial: LineBasicMaterial | undefined;
  private readonly mobilityDebugPointMaterial: PointsMaterial | undefined;
  private readonly cityLayouts: CityLayoutCache;
  private readonly buildingLayouts: BuildingLayoutCache;
  private readonly buildingRenderResources: BuildingRenderResources;
  private scene: Scene | undefined;
  private physics: PhysicsWorld | undefined;
  private focusPosition: WorldPosition = { x: 0, z: 0 };
  private generatedChunkCount = 0;
  private chunkLoadCount = 0;
  private chunkUnloadCount = 0;
  private roadGraphDebugEnabled = false;
  private buildingGraphDebugEnabled = false;
  private mobilityCache: { key: string; network: UrbanMobilityNetwork } | undefined;

  public constructor(
    private readonly config: GameConfig['world'],
    private readonly cityConfig: GameConfig['city'],
    private readonly buildingConfig: GameConfig['building'],
    spawnPosition: GameConfig['player']['spawnPosition'],
    showDebugVisualizations: boolean
  ) {
    this.terrainGenerator = new TerrainGenerator(config);
    this.cityLayouts = new CityLayoutCache(config.seed, cityConfig, (x, z) => this.terrainGenerator.getHeight(x, z));
    this.buildingLayouts = new BuildingLayoutCache(
      config.seed,
      cityConfig,
      buildingConfig,
      (coord) => this.cityLayouts.getRegion(coord),
      (x, z) => this.terrainGenerator.getHeight(x, z),
      spawnPosition
    );
    this.buildingRenderResources = new BuildingRenderResources(showDebugVisualizations);
    this.borderMaterial = showDebugVisualizations ? new LineBasicMaterial({ color: 0x5d8fff, transparent: true, opacity: 0.62 }) : undefined;
    this.roadGraphLineMaterial = showDebugVisualizations ? new LineBasicMaterial({ color: 0xffcf4d, transparent: true, opacity: 0.9 }) : undefined;
    this.roadGraphPointMaterial = showDebugVisualizations ? new PointsMaterial({ color: 0xff754d, size: 3, sizeAttenuation: true }) : undefined;
    this.mobilityDebugLineMaterial = showDebugVisualizations ? new LineBasicMaterial({ color: 0x54e8df, transparent: true, opacity: 0.85 }) : undefined;
    this.mobilityDebugPointMaterial = showDebugVisualizations ? new PointsMaterial({ color: 0xffe066, size: 5, sizeAttenuation: true }) : undefined;
  }

  public initialize(scene: Scene, physics: PhysicsWorld, focus: StreamingFocus): void {
    this.scene = scene;
    this.physics = physics;
    this.updateStreaming(focus);
  }

  public updateStreaming(focus: StreamingFocus): void {
    this.focusPosition = focus.getWorldPosition();
    const currentChunk = this.focusTracker.update(this.focusPosition, this.config.chunkSize);
    if (currentChunk === undefined) return;

    const desiredCoords = calculateActiveChunkCoords(currentChunk, this.config.activeChunkRadius);
    for (const coord of desiredCoords) {
      if (!this.activeChunks.has(chunkCoordKey(coord))) this.loadChunk(coord);
    }

    for (const chunk of [...this.activeChunks.values()]) {
      if (isOutsideUnloadRadius(chunk.coord, currentChunk, this.config.unloadChunkRadius)) this.unloadChunk(chunk);
    }
  }

  public getDebugInfo(): WorldStreamingDebugInfo {
    const currentLayout = this.cityLayouts.getRegionAt(this.focusPosition);
    let activeRoadChunkViewCount = 0;
    let visibleRoadSegmentCount = 0;
    let activeBuildingChunkViewCount = 0;
    let visibleBuildingCount = 0;
    let buildingColliderCount = 0;
    let windowInstanceCount = 0;
    let buildingDrawCallCount = 0;
    let activeLaneCount = 0;
    let activeIntersectionCount = 0;
    let activeSidewalkSegmentCount = 0;
    let activePedestrianNodeCount = 0;
    let activeCrossingCount = 0;
    for (const chunk of this.activeChunks.values()) {
      if (chunk.roadView !== undefined) {
        activeRoadChunkViewCount += 1;
        visibleRoadSegmentCount += chunk.roadView.visibleSegmentCount;
      }
      if (chunk.buildingView !== undefined) {
        activeBuildingChunkViewCount += 1;
        visibleBuildingCount += chunk.buildingView.visibleBuildingCount;
        windowInstanceCount += chunk.buildingView.windowInstanceCount;
        buildingDrawCallCount += chunk.buildingView.drawCallCount;
      }
      if (chunk.mobilityView !== undefined) {
        activeLaneCount += chunk.mobilityView.visibleLaneCount;
        activeIntersectionCount += chunk.mobilityView.visibleIntersectionCount;
        activeSidewalkSegmentCount += chunk.mobilityView.visibleSidewalkSegmentCount;
        activePedestrianNodeCount += chunk.mobilityView.visiblePedestrianNodeCount;
        activeCrossingCount += chunk.mobilityView.visibleCrossingCount;
      }
      buildingColliderCount += chunk.buildingBodies.length;
    }
    return {
      seed: this.config.seed,
      focusPosition: this.focusPosition,
      currentChunk: this.focusTracker.getCurrentChunk(),
      activeChunkCount: this.activeChunks.size,
      generatedChunkCount: this.generatedChunkCount,
      chunkLoadCount: this.chunkLoadCount,
      chunkUnloadCount: this.chunkUnloadCount,
      city: {
        currentRegion: currentLayout.coord,
        isUrban: currentLayout.isUrban,
        activeRoadChunkViewCount,
        visibleRoadSegmentCount,
        roadNodeCount: currentLayout.nodes.length,
        roadSegmentCount: currentLayout.segments.length,
        cityBlockCount: currentLayout.blocks.length,
        parcelCount: currentLayout.parcels.length,
        cachedRegionCount: this.cityLayouts.cachedRegionCount,
        roadGraphDebugEnabled: this.roadGraphDebugEnabled,
        activeBuildingChunkViewCount,
        visibleBuildingCount,
        buildingColliderCount,
        windowInstanceCount,
        buildingDrawCallCount,
        currentRegionBuildingCount: this.buildingLayouts.getBuildingsInRegion(currentLayout.coord).length,
        buildingGraphDebugEnabled: this.buildingGraphDebugEnabled,
        activeLaneCount,
        activeIntersectionCount,
        activeSidewalkSegmentCount,
        activePedestrianNodeCount,
        activeCrossingCount
      }
    };
  }

  public getTerrainHeight(worldX: number, worldZ: number): number {
    return this.terrainGenerator.getHeight(worldX, worldZ);
  }

  public isPositionLoaded(x: number, z: number): boolean {
    return this.activeChunks.has(chunkCoordKey(worldPositionToChunkCoord({ x, z }, this.config.chunkSize)));
  }

  public isTrafficLaneLoaded(lane: VehicleLane, x: number, z: number): boolean {
    return this.isPositionLoaded(x, z) && this.getLaneById(lane.id)?.roadId === lane.roadId;
  }

  /**
   * Pedestrian navigation is authored on the rendered street layer rather than
   * raw terrain.  Keeping this query in World gives spawn and movement one
   * consistent source of elevation.
   */
  public getWalkableSurfaceHeight(worldX: number, worldZ: number, surface: 'sidewalk' | 'crossing'): number {
    const terrain = this.getTerrainHeight(worldX, worldZ);
    return terrain + (surface === 'crossing'
      ? this.cityConfig.road.surfaceOffset
      : this.cityConfig.mobility.surfaceOffset);
  }

  public toggleRoadGraphDebug(): void {
    this.roadGraphDebugEnabled = !this.roadGraphDebugEnabled;
    for (const chunk of this.activeChunks.values()) {
      chunk.roadView?.setDebugVisible(this.roadGraphDebugEnabled);
      chunk.mobilityView?.setDebugVisible(this.roadGraphDebugEnabled);
    }
  }

  public toggleBuildingDebug(): void {
    this.buildingGraphDebugEnabled = !this.buildingGraphDebugEnabled;
    for (const chunk of this.activeChunks.values()) chunk.buildingView?.setDebugVisible(this.buildingGraphDebugEnabled);
  }

  public getBuildingById(id: string): BuildingData | undefined {
    return this.buildingLayouts.getBuildingById(id);
  }

  public getBuildingsInRegion(coord: CityRegionCoord): readonly BuildingData[] {
    return this.buildingLayouts.getBuildingsInRegion(coord);
  }

  public getBuildingEntrance(id: string): BuildingData['entrance'] | undefined {
    return this.getBuildingById(id)?.entrance;
  }

  public findNearestRoadSegment(position: WorldPosition): { readonly x: number; readonly z: number; readonly heading: number } | undefined {
    let result: { x: number; z: number; heading: number; distance: number } | undefined;
    const searchSize = this.cityConfig.regionSize;
    const layouts = this.cityLayouts.getRegionsForBounds(
      position.x - searchSize,
      position.x + searchSize,
      position.z - searchSize,
      position.z + searchSize
    );
    for (const layout of layouts) {
      const nodes = new Map(layout.nodes.map((node) => [node.id, node]));
      for (const segment of layout.segments) {
        const road = resolveRoadSegment(segment, nodes);
        const dx = road.end.x - road.start.x;
        const dz = road.end.z - road.start.z;
        const lengthSq = dx * dx + dz * dz;
        const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((position.x - road.start.x) * dx + (position.z - road.start.z) * dz) / lengthSq));
        const x = road.start.x + dx * t;
        const z = road.start.z + dz * t;
        const distance = (x - position.x) ** 2 + (z - position.z) ** 2;
        if (result === undefined || distance < result.distance) result = { x, z, heading: Math.atan2(dx, dz), distance };
      }
    }
    return result === undefined ? undefined : { x: result.x, z: result.z, heading: result.heading };
  }

  public findNearestLane(position: WorldPosition): ReturnType<typeof findNearestLane> {
    return findNearestLane(position, this.getMobilityNetworkAround(position).lanes);
  }

  public findNearestPedestrianNode(position: WorldPosition): ReturnType<typeof findNearestPedestrianNode> {
    return findNearestPedestrianNode(position, this.getMobilityNetworkAround(position).pedestrianNodes);
  }

  public getLaneById(id: string): VehicleLane | undefined {
    return this.getMobilityNetworkAround(this.focusPosition).lanes.find((lane) => lane.id === id);
  }

  public getIntersectionById(id: string): IntersectionData | undefined {
    return this.getMobilityNetworkAround(this.focusPosition).intersections.find((intersection) => intersection.id === id);
  }

  public getOutgoingLanes(laneId: string): readonly VehicleLane[] {
    const network = this.getMobilityNetworkAround(this.focusPosition);
    const laneById = new Map(network.lanes.map((lane) => [lane.id, lane]));
    return network.laneConnections
      .filter((connection) => connection.incomingLaneId === laneId)
      .map((connection) => laneById.get(connection.outgoingLaneId))
      .filter((lane): lane is VehicleLane => lane !== undefined);
  }

  public getPedestrianConnections(nodeId: string): readonly PedestrianConnection[] {
    return this.getMobilityNetworkAround(this.focusPosition).pedestrianConnections
      .filter((connection) => connection.fromNodeId === nodeId || connection.toNodeId === nodeId);
  }

  public dispose(): void {
    this.mobilityCache = undefined;
    this.cityLayouts.clear();
    this.buildingLayouts.clear();
    for (const chunk of [...this.activeChunks.values()]) this.unloadChunk(chunk);
    this.terrainMaterial.dispose();
    this.roadMaterial.dispose();
    this.sidewalkMaterial.dispose();
    this.curbMaterial.dispose();
    this.markingMaterial.dispose();
    this.buildingRenderResources.dispose();
    this.borderMaterial?.dispose();
    this.roadGraphLineMaterial?.dispose();
    this.roadGraphPointMaterial?.dispose();
    this.mobilityDebugLineMaterial?.dispose();
    this.mobilityDebugPointMaterial?.dispose();
    this.scene = undefined;
    this.physics = undefined;
  }

  private loadChunk(coord: ChunkCoord): void {
    const terrain = this.terrainGenerator.generateChunk(coord);
    const view = new TerrainChunkView(terrain, this.config.chunkSize, this.terrainMaterial, this.borderMaterial);
    const scene = this.requireScene();
    const physics = this.requirePhysics();
    view.addTo(scene);
    const physicsBody = physics.createStaticTerrainCollider([terrain.origin.x, terrain.origin.z], this.config.chunkSize, terrain.resolution, terrain.heights);
    const layouts = this.cityLayouts.getRegionsForBounds(terrain.origin.x, terrain.origin.x + this.config.chunkSize, terrain.origin.z, terrain.origin.z + this.config.chunkSize);
    const createdRoadView = new RoadChunkView(
      terrain.origin,
      this.config.chunkSize,
      layouts,
      (x, z) => this.terrainGenerator.getHeight(x, z),
      this.cityConfig.road.surfaceOffset,
      this.cityConfig.road.sampleSpacing,
      this.roadMaterial,
      this.roadGraphLineMaterial,
      this.roadGraphPointMaterial,
      this.roadGraphDebugEnabled
    );
    const roadView = createdRoadView.hasVisibleGeometry ? createdRoadView : undefined;
    if (roadView !== undefined) roadView.addTo(scene);
    else createdRoadView.dispose(scene);
    const createdMobilityView = new MobilityChunkView(
      terrain.origin,
      this.config.chunkSize,
      layouts,
      (x, z) => this.terrainGenerator.getHeight(x, z),
      this.cityConfig.mobility,
      this.cityConfig.road.sampleSpacing,
      this.sidewalkMaterial,
      this.curbMaterial,
      this.markingMaterial,
      this.mobilityDebugLineMaterial,
      this.mobilityDebugPointMaterial,
      this.roadGraphDebugEnabled
    );
    const mobilityView = createdMobilityView.visibleSidewalkSegmentCount > 0 ? createdMobilityView : undefined;
    if (mobilityView !== undefined) mobilityView.addTo(scene);
    else createdMobilityView.dispose(scene);
    const buildings = this.buildingLayouts.getBuildingsForChunk(terrain.origin, this.config.chunkSize);
    const buildingView = buildings.length > 0
      ? new BuildingChunkView(buildings, this.buildingConfig, this.buildingRenderResources, this.buildingGraphDebugEnabled)
      : undefined;
    buildingView?.addTo(scene);
    const buildingBodies = buildings.map((building) => physics.createStaticCuboid(
      [building.x, building.baseElevation + (building.height - building.foundationHeight) / 2, building.z],
      [building.width / 2, (building.height + building.foundationHeight) / 2, building.depth / 2],
      building.rotation
    ));
    this.activeChunks.set(terrain.key, { coord, view, roadView, mobilityView, buildingView, buildingBodies, physicsBody });
    this.generatedChunkCount += 1;
    this.chunkLoadCount += 1;
  }

  private unloadChunk(chunk: ActiveChunk): void {
    chunk.buildingView?.dispose(this.requireScene());
    for (const body of chunk.buildingBodies) this.requirePhysics().removeRigidBody(body);
    chunk.mobilityView?.dispose(this.requireScene());
    chunk.roadView?.dispose(this.requireScene());
    chunk.view.dispose(this.requireScene());
    this.requirePhysics().removeRigidBody(chunk.physicsBody);
    this.activeChunks.delete(chunkCoordKey(chunk.coord));
    this.chunkUnloadCount += 1;
  }

  private requireScene(): Scene {
    if (this.scene === undefined) throw new Error('World scene has not been initialized.');
    return this.scene;
  }

  private requirePhysics(): PhysicsWorld {
    if (this.physics === undefined) throw new Error('World physics has not been initialized.');
    return this.physics;
  }

  public getPedestrianNetworkAround(position: WorldPosition): UrbanMobilityNetwork {
    const size = this.cityConfig.regionSize;
    const x = Math.floor(position.x / size); const z = Math.floor(position.z / size);
    const key = `${x}:${z}`;
    if (this.mobilityCache?.key === key) return this.mobilityCache.network;
    const layouts = this.cityLayouts.getRegionsForBounds((x - 1) * size, (x + 2) * size - 1e-6, (z - 1) * size, (z + 2) * size - 1e-6);
    const network = buildUrbanMobilityNetwork(layouts, this.cityConfig.mobility);
    this.mobilityCache = { key, network };
    return network;
  }

  private getMobilityNetworkAround(position: WorldPosition): UrbanMobilityNetwork {
    return this.getPedestrianNetworkAround(position);
  }
}
