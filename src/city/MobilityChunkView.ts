import { BufferAttribute, BufferGeometry, LineSegments, Mesh, Points } from 'three';
import type { Scene } from 'three';
import type { LineBasicMaterial, MeshStandardMaterial, PointsMaterial } from 'three';
import type { GameConfig } from '../core/Config';
import { buildStreetMeshData } from './MobilityGeometry';
import type { TerrainHeightQuery } from './RoadGeometry';
import type { CityRegionLayout } from './CityTypes';
import { buildUrbanMobilityNetwork } from './UrbanMobility';
import type { UrbanMobilityNetwork } from './UrbanMobility';

export class MobilityChunkView {
  public readonly network: UrbanMobilityNetwork;
  public readonly visibleLaneCount: number;
  public readonly visibleSidewalkSegmentCount: number;
  public readonly visiblePedestrianNodeCount: number;
  public readonly visibleCrossingCount: number;
  public readonly visibleIntersectionCount: number;
  private readonly sidewalk: Mesh;
  private readonly curb: Mesh;
  private readonly marking: Mesh;
  private readonly debugLines: LineSegments | undefined;
  private readonly intersectionPoints: Points | undefined;

  public constructor(
    chunkOrigin: { readonly x: number; readonly z: number },
    chunkSize: number,
    layouts: readonly CityRegionLayout[],
    terrainHeight: TerrainHeightQuery,
    config: GameConfig['city']['mobility'],
    sampleSpacing: number,
    sidewalkMaterial: MeshStandardMaterial,
    curbMaterial: MeshStandardMaterial,
    markingMaterial: MeshStandardMaterial,
    debugLineMaterial: LineBasicMaterial | undefined,
    debugPointMaterial: PointsMaterial | undefined,
    debugVisible: boolean
  ) {
    this.network = buildUrbanMobilityNetwork(layouts, config);
    const data = buildStreetMeshData(layouts, this.network, {
      minX: chunkOrigin.x, maxX: chunkOrigin.x + chunkSize, minZ: chunkOrigin.z, maxZ: chunkOrigin.z + chunkSize
    }, terrainHeight, config, sampleSpacing);
    this.visibleLaneCount = data.visibleLaneCount;
    this.visibleSidewalkSegmentCount = data.visibleSidewalkSegmentCount;
    this.visiblePedestrianNodeCount = data.visiblePedestrianNodeCount;
    this.visibleCrossingCount = data.visibleCrossingCount;
    this.visibleIntersectionCount = data.visibleIntersectionCount;
    this.sidewalk = createMesh(data.sidewalk, sidewalkMaterial);
    this.curb = createMesh(data.curb, curbMaterial);
    this.marking = createMesh(data.marking, markingMaterial);
    if (debugLineMaterial !== undefined && debugPointMaterial !== undefined) {
      this.debugLines = new LineSegments(createGeometry(data.debugLines), debugLineMaterial);
      this.intersectionPoints = new Points(createGeometry(data.intersectionPoints), debugPointMaterial);
      this.setDebugVisible(debugVisible);
    }
  }

  public addTo(scene: Scene): void {
    scene.add(this.sidewalk, this.curb, this.marking);
    if (this.debugLines !== undefined) scene.add(this.debugLines);
    if (this.intersectionPoints !== undefined) scene.add(this.intersectionPoints);
  }

  public setDebugVisible(visible: boolean): void {
    if (this.debugLines !== undefined) this.debugLines.visible = visible;
    if (this.intersectionPoints !== undefined) this.intersectionPoints.visible = visible;
  }

  public dispose(scene: Scene): void {
    scene.remove(this.sidewalk, this.curb, this.marking);
    this.sidewalk.geometry.dispose();
    this.curb.geometry.dispose();
    this.marking.geometry.dispose();
    if (this.debugLines !== undefined) {
      scene.remove(this.debugLines);
      this.debugLines.geometry.dispose();
    }
    if (this.intersectionPoints !== undefined) {
      scene.remove(this.intersectionPoints);
      this.intersectionPoints.geometry.dispose();
    }
  }
}

function createMesh(data: { readonly positions: Float32Array; readonly indices: Uint32Array }, material: MeshStandardMaterial): Mesh {
  const mesh = new Mesh(createGeometry(data.positions, data.indices), material);
  mesh.receiveShadow = true;
  return mesh;
}

function createGeometry(positions: Float32Array, indices?: Uint32Array): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  if (indices !== undefined) geometry.setIndex(new BufferAttribute(indices, 1));
  geometry.computeVertexNormals();
  return geometry;
}
