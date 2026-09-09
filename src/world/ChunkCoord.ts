export interface ChunkCoord {
  readonly x: number;
  readonly z: number;
}

export interface WorldPosition {
  readonly x: number;
  readonly z: number;
}

export function worldPositionToChunkCoord(position: WorldPosition, chunkSize: number): ChunkCoord {
  return {
    x: Math.floor(position.x / chunkSize),
    z: Math.floor(position.z / chunkSize)
  };
}

export function chunkCoordToWorldOrigin(coord: ChunkCoord, chunkSize: number): WorldPosition {
  return { x: coord.x * chunkSize, z: coord.z * chunkSize };
}

export function chunkCoordKey(coord: ChunkCoord): string {
  return `${coord.x}:${coord.z}`;
}

export function chunkCoordEquals(left: ChunkCoord | undefined, right: ChunkCoord): boolean {
  return left?.x === right.x && left.z === right.z;
}

export function chunkChebyshevDistance(left: ChunkCoord, right: ChunkCoord): number {
  return Math.max(Math.abs(left.x - right.x), Math.abs(left.z - right.z));
}
