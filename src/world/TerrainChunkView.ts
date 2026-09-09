import {
  BufferAttribute,
  BufferGeometry,
  LineLoop,
  Mesh
} from 'three';
import type { Scene } from 'three';
import type { LineBasicMaterial, MeshStandardMaterial } from 'three';
import type { GeneratedTerrainChunk } from './TerrainGenerator';

export class TerrainChunkView {
  public readonly mesh: Mesh;
  private readonly terrainGeometry: BufferGeometry;
  private readonly border: LineLoop | undefined;

  public constructor(
    data: GeneratedTerrainChunk,
    chunkSize: number,
    terrainMaterial: MeshStandardMaterial,
    borderMaterial: LineBasicMaterial | undefined
  ) {
    this.terrainGeometry = createTerrainGeometry(data, chunkSize);
    this.mesh = new Mesh(this.terrainGeometry, terrainMaterial);
    this.mesh.position.set(data.origin.x, 0, data.origin.z);
    this.mesh.receiveShadow = true;

    if (borderMaterial !== undefined) {
      this.border = new LineLoop(createBorderGeometry(data, chunkSize), borderMaterial);
      this.border.position.copy(this.mesh.position);
    }
  }

  public addTo(scene: Scene): void {
    scene.add(this.mesh);
    if (this.border !== undefined) scene.add(this.border);
  }

  public dispose(scene: Scene): void {
    scene.remove(this.mesh);
    this.terrainGeometry.dispose();
    if (this.border !== undefined) {
      scene.remove(this.border);
      this.border.geometry.dispose();
    }
  }
}

function createTerrainGeometry(data: GeneratedTerrainChunk, chunkSize: number): BufferGeometry {
  const verticesPerSide = data.resolution + 1;
  const vertexCount = verticesPerSide * verticesPerSide;
  const positions = new Float32Array(vertexCount * 3);
  const colors = new Float32Array(vertexCount * 3);
  const indices = new Uint32Array(data.resolution * data.resolution * 6);
  const spacing = chunkSize / data.resolution;
  let vertexOffset = 0;

  for (let z = 0; z < verticesPerSide; z += 1) {
    for (let x = 0; x < verticesPerSide; x += 1) {
      const height = data.heights[z * verticesPerSide + x] ?? 0;
      positions[vertexOffset] = x * spacing;
      positions[vertexOffset + 1] = height;
      positions[vertexOffset + 2] = z * spacing;

      const shade = Math.min(Math.max((height + 7) / 14, 0), 1);
      colors[vertexOffset] = 0.22 + shade * 0.08;
      colors[vertexOffset + 1] = 0.38 + shade * 0.18;
      colors[vertexOffset + 2] = 0.17 + shade * 0.07;
      vertexOffset += 3;
    }
  }

  let indexOffset = 0;
  for (let z = 0; z < data.resolution; z += 1) {
    for (let x = 0; x < data.resolution; x += 1) {
      const lowerLeft = z * verticesPerSide + x;
      const lowerRight = lowerLeft + 1;
      const upperLeft = lowerLeft + verticesPerSide;
      const upperRight = upperLeft + 1;
      indices[indexOffset] = lowerLeft;
      indices[indexOffset + 1] = upperLeft;
      indices[indexOffset + 2] = lowerRight;
      indices[indexOffset + 3] = lowerRight;
      indices[indexOffset + 4] = upperLeft;
      indices[indexOffset + 5] = upperRight;
      indexOffset += 6;
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('color', new BufferAttribute(colors, 3));
  geometry.setIndex(new BufferAttribute(indices, 1));
  geometry.computeVertexNormals();
  return geometry;
}

function createBorderGeometry(data: GeneratedTerrainChunk, chunkSize: number): BufferGeometry {
  const verticesPerSide = data.resolution + 1;
  const eastHeight = data.heights[data.resolution] ?? 0;
  const southEastHeight = data.heights[verticesPerSide * verticesPerSide - 1] ?? 0;
  const southHeight = data.heights[verticesPerSide * data.resolution] ?? 0;
  const northHeight = data.heights[0] ?? 0;
  const lift = 0.15;
  const points = new Float32Array([
    0, northHeight + lift, 0,
    chunkSize, eastHeight + lift, 0,
    chunkSize, southEastHeight + lift, chunkSize,
    0, southHeight + lift, chunkSize
  ]);
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(points, 3));
  return geometry;
}
