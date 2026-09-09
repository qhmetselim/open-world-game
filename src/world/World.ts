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
import { chunkCoordKey } from './ChunkCoord';
import { TerrainGenerator } from './TerrainGenerator';
import { TerrainChunkView } from './TerrainChunkView';
import type { StreamingFocus } from './ChunkStreaming';
import { CityLayoutCache } from '../city/CityLayoutCache';
import { RoadChunkView } from '../city/RoadChunkView';
import type { CityRegionCoord } from '../city/CityTypes';

interface ActiveChunk {
  readonly coord: ChunkCoord;
  readonly view: TerrainChunkView;
  readonly roadView: RoadChunkView | undefined;
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
  private readonly borderMaterial: LineBasicMaterial | undefined;
  private readonly roadGraphLineMaterial: LineBasicMaterial | undefined;
  private readonly roadGraphPointMaterial: PointsMaterial | undefined;
  private readonly cityLayouts: CityLayoutCache;
  private scene: Scene | undefined;
  private physics: PhysicsWorld | undefined;
  private focusPosition: WorldPosition = { x: 0, z: 0 };
  private generatedChunkCount = 0;
  private chunkLoadCount = 0;
  private chunkUnloadCount = 0;
  private roadGraphDebugEnabled = false;

  public constructor(
    private readonly config: GameConfig['world'],
    private readonly cityConfig: GameConfig['city'],
    showDebugVisualizations: boolean
  ) {
    this.terrainGenerator = new TerrainGenerator(config);
    this.cityLayouts = new CityLayoutCache(config.seed, cityConfig, (x, z) => this.terrainGenerator.getHeight(x, z));
    this.borderMaterial = showDebugVisualizations ? new LineBasicMaterial({ color: 0x5d8fff, transparent: true, opacity: 0.62 }) : undefined;
    this.roadGraphLineMaterial = showDebugVisualizations ? new LineBasicMaterial({ color: 0xffcf4d, transparent: true, opacity: 0.9 }) : undefined;
    this.roadGraphPointMaterial = showDebugVisualizations ? new PointsMaterial({ color: 0xff754d, size: 3, sizeAttenuation: true }) : undefined;
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
    for (const chunk of this.activeChunks.values()) {
      if (chunk.roadView === undefined) continue;
      activeRoadChunkViewCount += 1;
      visibleRoadSegmentCount += chunk.roadView.visibleSegmentCount;
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
        roadGraphDebugEnabled: this.roadGraphDebugEnabled
      }
    };
  }

  public getTerrainHeight(worldX: number, worldZ: number): number {
    return this.terrainGenerator.getHeight(worldX, worldZ);
  }

  public toggleRoadGraphDebug(): void {
    this.roadGraphDebugEnabled = !this.roadGraphDebugEnabled;
    for (const chunk of this.activeChunks.values()) chunk.roadView?.setDebugVisible(this.roadGraphDebugEnabled);
  }

  public dispose(): void {
    for (const chunk of [...this.activeChunks.values()]) this.unloadChunk(chunk);
    this.terrainMaterial.dispose();
    this.roadMaterial.dispose();
    this.borderMaterial?.dispose();
    this.roadGraphLineMaterial?.dispose();
    this.roadGraphPointMaterial?.dispose();
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
    const roadView = createdRoadView.visibleSegmentCount > 0 ? createdRoadView : undefined;
    if (roadView !== undefined) roadView.addTo(scene);
    else createdRoadView.dispose(scene);
    this.activeChunks.set(terrain.key, { coord, view, roadView, physicsBody });
    this.generatedChunkCount += 1;
    this.chunkLoadCount += 1;
  }

  private unloadChunk(chunk: ActiveChunk): void {
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
}
