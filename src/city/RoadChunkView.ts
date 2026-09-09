import {
  BufferAttribute,
  BufferGeometry,
  LineSegments,
  Mesh,
  Points
} from 'three';
import type { Scene } from 'three';
import type { LineBasicMaterial, MeshStandardMaterial, PointsMaterial } from 'three';
import type { CityRegionLayout, ResolvedRoadSegment } from './CityTypes';
import { resolveRoadSegment } from './CityTypes';
import { buildRoadSurface, clippedRoadOwnedByChunk, clipRoadSegmentToBounds, intersectionOwnedByChunk, prepareRoadSurfaces } from './RoadGeometry';
import type { TerrainHeightQuery } from './RoadGeometry';

export class RoadChunkView {
  public readonly mesh: Mesh;
  public readonly visibleSegmentCount: number;
  public readonly visibleIntersectionCount: number;
  private readonly geometry: BufferGeometry;
  private readonly graphLines: LineSegments | undefined;
  private readonly graphPoints: Points | undefined;

  public constructor(
    chunkOrigin: { readonly x: number; readonly z: number },
    chunkSize: number,
    layouts: readonly CityRegionLayout[],
    terrainHeight: TerrainHeightQuery,
    surfaceOffset: number,
    sampleSpacing: number,
    roadMaterial: MeshStandardMaterial,
    graphLineMaterial: LineBasicMaterial | undefined,
    graphPointMaterial: PointsMaterial | undefined,
    graphVisible: boolean
  ) {
    const bounds = {
      minX: chunkOrigin.x,
      maxX: chunkOrigin.x + chunkSize,
      minZ: chunkOrigin.z,
      maxZ: chunkOrigin.z + chunkSize
    };
    const roads = new Map<string, ResolvedRoadSegment>();
    for (const layout of layouts) {
      const nodes = new Map(layout.nodes.map((node) => [node.id, node]));
      for (const segment of layout.segments) roads.set(segment.id, resolveRoadSegment(segment, nodes));
    }
    const prepared = prepareRoadSurfaces([...roads.values()]);
    const segments = prepared.segments.flatMap((road) => {
      const clipped = clipRoadSegmentToBounds(road, bounds);
      return clipped !== undefined && hasVisibleLength(clipped) && clippedRoadOwnedByChunk(clipped, chunkOrigin, chunkSize) ? [clipped] : [];
    });
    const intersections = prepared.intersections.filter((intersection) => intersectionOwnedByChunk(intersection, chunkOrigin, chunkSize));
    const surface = buildRoadSurface(segments, terrainHeight, surfaceOffset, sampleSpacing, intersections);
    this.visibleSegmentCount = surface.visibleSegmentCount;
    this.visibleIntersectionCount = surface.visibleIntersectionCount;
    this.geometry = new BufferGeometry();
    this.geometry.setAttribute('position', new BufferAttribute(surface.positions, 3));
    this.geometry.setIndex(new BufferAttribute(surface.indices, 1));
    this.geometry.computeVertexNormals();
    this.mesh = new Mesh(this.geometry, roadMaterial);
    this.mesh.receiveShadow = true;

    if (graphLineMaterial !== undefined && graphPointMaterial !== undefined) {
      this.graphLines = new LineSegments(createLineGeometry(surface.centerLines), graphLineMaterial);
      this.graphPoints = new Points(createPointGeometry(surface.nodePoints), graphPointMaterial);
      this.setDebugVisible(graphVisible);
    }
  }

  public get hasVisibleGeometry(): boolean {
    return this.visibleSegmentCount > 0 || this.visibleIntersectionCount > 0;
  }

  public addTo(scene: Scene): void {
    scene.add(this.mesh);
    if (this.graphLines !== undefined) scene.add(this.graphLines);
    if (this.graphPoints !== undefined) scene.add(this.graphPoints);
  }

  public setDebugVisible(visible: boolean): void {
    if (this.graphLines !== undefined) this.graphLines.visible = visible;
    if (this.graphPoints !== undefined) this.graphPoints.visible = visible;
  }

  public dispose(scene: Scene): void {
    scene.remove(this.mesh);
    this.geometry.dispose();
    if (this.graphLines !== undefined) {
      scene.remove(this.graphLines);
      this.graphLines.geometry.dispose();
    }
    if (this.graphPoints !== undefined) {
      scene.remove(this.graphPoints);
      this.graphPoints.geometry.dispose();
    }
  }
}

function hasVisibleLength(segment: ResolvedRoadSegment): boolean {
  return Math.hypot(segment.end.x - segment.start.x, segment.end.z - segment.start.z) > 0.001;
}

function createLineGeometry(points: Float32Array): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(points, 3));
  return geometry;
}

function createPointGeometry(points: Float32Array): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(points, 3));
  return geometry;
}
