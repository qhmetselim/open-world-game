import {
  BufferAttribute,
  BufferGeometry,
  Group,
  InstancedMesh,
  LineSegments,
  Matrix4,
  Vector3
} from 'three';
import type { Material, Scene } from 'three';
import type { BuildingData } from '../buildings/BuildingTypes';
import { calculateWindowGrid, getBuildingFootprintCorners, transformLocalPoint } from '../buildings/BuildingGeometry';
import type { GameConfig } from '../core/Config';
import type { BuildingRenderResources } from './BuildingRenderResources';

interface BoxInstance {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly width: number;
  readonly height: number;
  readonly depth: number;
  readonly rotation: number;
}

export class BuildingChunkView {
  public readonly group = new Group();
  public readonly visibleBuildingCount: number;
  public readonly windowInstanceCount: number;
  public readonly drawCallCount: number;
  private readonly debugLines: LineSegments | undefined;

  public constructor(
    buildings: readonly BuildingData[],
    private readonly config: GameConfig['building'],
    private readonly resources: BuildingRenderResources,
    debugVisible: boolean
  ) {
    this.visibleBuildingCount = buildings.length;
    const facades = resources.facadeMaterials.map(() => [] as BoxInstance[]);
    const foundations: BoxInstance[] = [];
    const roofs: BoxInstance[] = [];
    const parapets: BoxInstance[] = [];
    const utilities: BoxInstance[] = [];
    const windows: BoxInstance[] = [];
    const entrances: BoxInstance[] = [];
    const debugPositions: number[] = [];

    for (const building of buildings) {
      const facade = facades[building.style.facadePaletteIndex % facades.length];
      facade?.push({
        x: building.x, y: building.baseElevation + building.height / 2, z: building.z,
        width: building.width, height: building.height, depth: building.depth, rotation: building.rotation
      });
      foundations.push({
        x: building.x, y: building.baseElevation - building.foundationHeight / 2, z: building.z,
        width: building.width + 0.35, height: building.foundationHeight, depth: building.depth + 0.35, rotation: building.rotation
      });
      roofs.push({
        x: building.x, y: building.baseElevation + building.height + 0.22, z: building.z,
        width: building.width + 0.38, height: 0.44, depth: building.depth + 0.38, rotation: building.rotation
      });
      this.addRoofVariation(building, parapets, utilities);
      this.addWindows(building, windows);
      entrances.push(this.createEntrance(building));
      addDebugFootprint(debugPositions, building);
    }

    this.addInstances(facades, resources.facadeMaterials);
    this.addInstances([foundations], [resources.foundationMaterial]);
    this.addInstances([roofs, parapets, utilities], [resources.roofMaterial, resources.roofMaterial, resources.roofMaterial]);
    this.addInstances([windows], [resources.windowMaterial]);
    this.addInstances([entrances], [resources.entranceMaterial]);
    this.windowInstanceCount = windows.length;
    if (resources.debugMaterial !== undefined && debugPositions.length > 0) {
      const geometry = new BufferGeometry();
      geometry.setAttribute('position', new BufferAttribute(new Float32Array(debugPositions), 3));
      this.debugLines = new LineSegments(geometry, resources.debugMaterial);
      this.debugLines.visible = debugVisible;
      this.group.add(this.debugLines);
    }
    this.drawCallCount = this.group.children.filter((child) => child instanceof InstancedMesh).length;
  }

  public addTo(scene: Scene): void {
    scene.add(this.group);
  }

  public setDebugVisible(visible: boolean): void {
    if (this.debugLines !== undefined) this.debugLines.visible = visible;
  }

  public dispose(scene: Scene): void {
    scene.remove(this.group);
    for (const child of this.group.children) {
      if (child instanceof InstancedMesh) child.dispose();
      if (child instanceof LineSegments) child.geometry.dispose();
    }
    this.group.clear();
  }

  private addInstances(groups: readonly BoxInstance[][], materials: readonly Material[]): void {
    for (let index = 0; index < groups.length; index += 1) {
      const instances = groups[index];
      const material = materials[index];
      if (instances === undefined || instances.length === 0 || material === undefined) continue;
      const mesh = new InstancedMesh(this.resources.unitBoxGeometry, material, instances.length);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      for (let instanceIndex = 0; instanceIndex < instances.length; instanceIndex += 1) {
        const instance = instances[instanceIndex];
        if (instance !== undefined) mesh.setMatrixAt(instanceIndex, createMatrix(instance));
      }
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingBox();
      mesh.computeBoundingSphere();
      this.group.add(mesh);
    }
  }

  private addRoofVariation(building: BuildingData, parapets: BoxInstance[], utilities: BoxInstance[]): void {
    const roofY = building.baseElevation + building.height + 0.58;
    if (building.style.roof === 'parapet') {
      const thickness = 0.32;
      this.addLocalBox(parapets, building, 0, -building.depth / 2, roofY, building.width + 0.55, 0.7, thickness, building.rotation);
      this.addLocalBox(parapets, building, 0, building.depth / 2, roofY, building.width + 0.55, 0.7, thickness, building.rotation);
      this.addLocalBox(parapets, building, -building.width / 2, 0, roofY, building.depth + 0.55, 0.7, thickness, building.rotation + Math.PI / 2);
      this.addLocalBox(parapets, building, building.width / 2, 0, roofY, building.depth + 0.55, 0.7, thickness, building.rotation + Math.PI / 2);
    }
    if (building.style.roof === 'utility') {
      utilities.push({
        x: building.x, y: roofY, z: building.z,
        width: Math.max(2, building.width * 0.24), height: 1.15, depth: Math.max(2, building.depth * 0.24), rotation: building.rotation
      });
    }
  }

  private addWindows(building: BuildingData, windows: BoxInstance[]): void {
    const frontGrid = calculateWindowGrid(building.width, building.floors, this.config.window.targetSpacing, this.config.window.minimumWidth);
    const sideGrid = calculateWindowGrid(building.depth, building.floors, this.config.window.targetSpacing, this.config.window.minimumWidth);
    const frontWindowWidth = Math.min(this.config.window.targetSpacing * 0.54, frontGrid.horizontalSpacing * 0.58);
    const sideWindowWidth = Math.min(this.config.window.targetSpacing * 0.54, sideGrid.horizontalSpacing * 0.58);
    for (let floor = 0; floor < building.floors; floor += 1) {
      const y = building.baseElevation + (floor + 0.53) * this.config.floorHeight;
      for (let column = 0; column < frontGrid.columns; column += 1) {
        const localX = -building.width / 2 + (column + 0.5) * frontGrid.horizontalSpacing;
        this.addLocalBox(windows, building, localX, -building.depth / 2 - this.config.window.depth / 2, y, frontWindowWidth, this.config.window.height, this.config.window.depth, building.rotation);
      }
      for (const side of [-1, 1] as const) {
        for (let column = 0; column < sideGrid.columns; column += 1) {
          const localZ = -building.depth / 2 + (column + 0.5) * sideGrid.horizontalSpacing;
          this.addLocalBox(windows, building, side * (building.width / 2 + this.config.window.depth / 2), localZ, y, sideWindowWidth, this.config.window.height, this.config.window.depth, building.rotation + Math.PI / 2);
        }
      }
    }
  }

  private createEntrance(building: BuildingData): BoxInstance {
    const local = transformLocalPoint(building, 0, -building.depth / 2 - 0.07);
    return {
      x: local.x, y: building.baseElevation + this.config.floorHeight * 0.42, z: local.z,
      width: Math.min(2.5, building.width * 0.28), height: this.config.floorHeight * 0.84, depth: 0.14, rotation: building.rotation
    };
  }

  private addLocalBox(
    output: BoxInstance[], building: BuildingData, localX: number, localZ: number, y: number,
    width: number, height: number, depth: number, rotation: number
  ): void {
    const world = transformLocalPoint(building, localX, localZ);
    output.push({ x: world.x, y, z: world.z, width, height, depth, rotation });
  }
}

function createMatrix(instance: BoxInstance): Matrix4 {
  return new Matrix4().makeRotationY(instance.rotation).scale(new Vector3(instance.width, instance.height, instance.depth)).setPosition(instance.x, instance.y, instance.z);
}

function addDebugFootprint(output: number[], building: BuildingData): void {
  const corners = getBuildingFootprintCorners(building);
  for (let index = 0; index < corners.length; index += 1) {
    const current = corners[index];
    const next = corners[(index + 1) % corners.length];
    if (current === undefined || next === undefined) continue;
    output.push(current.x, building.baseElevation + 0.12, current.z, next.x, building.baseElevation + 0.12, next.z);
  }
  output.push(
    building.entrance.x, building.entrance.y, building.entrance.z,
    building.entrance.x + building.entrance.directionX * 2, building.entrance.y, building.entrance.z + building.entrance.directionZ * 2
  );
}
