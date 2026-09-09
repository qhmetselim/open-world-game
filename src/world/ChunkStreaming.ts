import {
  chunkChebyshevDistance,
  chunkCoordEquals,
  worldPositionToChunkCoord
} from './ChunkCoord';
import type { ChunkCoord, WorldPosition } from './ChunkCoord';

export interface StreamingFocus {
  getWorldPosition(): WorldPosition;
}

export function calculateActiveChunkCoords(center: ChunkCoord, radius: number): ChunkCoord[] {
  const coords: ChunkCoord[] = [];
  for (let z = center.z - radius; z <= center.z + radius; z += 1) {
    for (let x = center.x - radius; x <= center.x + radius; x += 1) {
      coords.push({ x, z });
    }
  }

  return coords.sort((left, right) => {
    const leftDistance = (left.x - center.x) ** 2 + (left.z - center.z) ** 2;
    const rightDistance = (right.x - center.x) ** 2 + (right.z - center.z) ** 2;
    return leftDistance - rightDistance || left.z - right.z || left.x - right.x;
  });
}

export function isOutsideUnloadRadius(coord: ChunkCoord, focus: ChunkCoord, unloadRadius: number): boolean {
  return chunkChebyshevDistance(coord, focus) > unloadRadius;
}

export class StreamingFocusTracker {
  private currentChunk: ChunkCoord | undefined;

  public update(position: WorldPosition, chunkSize: number): ChunkCoord | undefined {
    const nextChunk = worldPositionToChunkCoord(position, chunkSize);
    if (chunkCoordEquals(this.currentChunk, nextChunk)) return undefined;
    this.currentChunk = nextChunk;
    return nextChunk;
  }

  public getCurrentChunk(): ChunkCoord | undefined {
    return this.currentChunk;
  }
}
