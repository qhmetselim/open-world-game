import { LineBasicMaterial, MeshStandardMaterial } from 'three';
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

interface ActiveChunk {
  readonly coord: ChunkCoord;
  readonly view: TerrainChunkView;
  readonly physicsBody: ReturnType<PhysicsWorld['createStaticTerrainCollider']>;
}

export interface WorldStreamingDebugInfo {
  readonly seed: string;
  readonly focusPosition: WorldPosition;
  readonly currentChunk: ChunkCoord | undefined;
  readonly activeChunkCount: number;
  readonly generatedChunkCount: number;
  readonly chunkLoadCount: number;
  readonly chunkUnloadCount: number;
}

export class World {
  private readonly terrainGenerator: TerrainGenerator;
  private readonly focusTracker = new StreamingFocusTracker();
  private readonly activeChunks = new Map<string, ActiveChunk>();
  private readonly terrainMaterial = new MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0 });
  private readonly borderMaterial: LineBasicMaterial | undefined;
  private scene: Scene | undefined;
  private physics: PhysicsWorld | undefined;
  private focusPosition: WorldPosition = { x: 0, z: 0 };
  private generatedChunkCount = 0;
  private chunkLoadCount = 0;
  private chunkUnloadCount = 0;

  public constructor(private readonly config: GameConfig['world'], showChunkBorders: boolean) {
    this.terrainGenerator = new TerrainGenerator(config);
    this.borderMaterial = showChunkBorders ? new LineBasicMaterial({ color: 0x5d8fff, transparent: true, opacity: 0.62 }) : undefined;
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
    return {
      seed: this.config.seed,
      focusPosition: this.focusPosition,
      currentChunk: this.focusTracker.getCurrentChunk(),
      activeChunkCount: this.activeChunks.size,
      generatedChunkCount: this.generatedChunkCount,
      chunkLoadCount: this.chunkLoadCount,
      chunkUnloadCount: this.chunkUnloadCount
    };
  }

  public dispose(): void {
    for (const chunk of [...this.activeChunks.values()]) this.unloadChunk(chunk);
    this.terrainMaterial.dispose();
    this.borderMaterial?.dispose();
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
    this.activeChunks.set(terrain.key, { coord, view, physicsBody });
    this.generatedChunkCount += 1;
    this.chunkLoadCount += 1;
  }

  private unloadChunk(chunk: ActiveChunk): void {
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
