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
import { visualTheme } from './VisualTheme';
import type { InteriorLayout } from '../interiors/InteriorLayout';
import { interiorConfig } from '../interiors/InteriorLayout';
import { coreModels } from './loaders/CoreModels';

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
    debugVisible: boolean,
    interior?: InteriorLayout
  ) {
    this.visibleBuildingCount = buildings.length;
    const facades = resources.facadeMaterials.map(() => [] as BoxInstance[]);
    const foundations: BoxInstance[] = [];
    const roofs: BoxInstance[] = [];
    const parapets: BoxInstance[] = [];
    const utilities: BoxInstance[] = [];
    const windows: BoxInstance[] = [];
    const entrances: BoxInstance[] = [];
    const trim: BoxInstance[] = [];
    const accents: BoxInstance[] = [];
    const modules = { balcony: [] as BoxInstance[], awning: [] as BoxInstance[], entrySign: [] as BoxInstance[], planter: [] as BoxInstance[], roofUnit: [] as BoxInstance[] };
    const debugPositions: number[] = [];

    for (const building of buildings) {
      const facade = facades[building.style.facadePaletteIndex % facades.length];
      const enterable = interior?.building.id === building.id;
      if (enterable) {
        for (const box of interior.shell.filter((box) => box.y >= 0)) {
          const point = transformLocalPoint(building, box.x, box.z);
          facade?.push({ ...box, x: point.x, z: point.z, y: building.baseElevation + box.y, rotation: building.rotation });
        }
      } else facade?.push({
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
      if (!enterable) entrances.push(this.createEntrance(building));
      this.addFacadeTreatment(building, trim, accents, modules);
      addDebugFootprint(debugPositions, building);
    }

    this.addInstances(facades, resources.facadeMaterials);
    this.addInstances([foundations], [resources.foundationMaterial]);
    this.addInstances([[...roofs, ...parapets, ...utilities]], [resources.roofMaterial]);
    const windowModule = coreModels.geometry('facadeWindow');
    if (windowModule) {
      this.addModule('facadeWindow', windows.map(window => ({ ...window, depth: 1 })));
    } else this.addInstances([windows], [resources.windowMaterial]);
    // One shared batch for all sills, not one mesh per window. Silhouette, no interior geometry.
    const sills = windows.map((window) => ({ ...window,
      y: window.y - this.config.window.height / 2,
      width: window.width + visualTheme.building.sillOverhang * 2,
      height: visualTheme.building.sillHeight,
      depth: window.depth + visualTheme.building.sillOverhang
    }));
    this.addInstances([windowModule ? trim : [...trim, ...sills]], [resources.trimMaterial]);
    this.addInstances([accents], [resources.roofMaterial]);
    for (const key of ['balcony', 'awning', 'entrySign', 'planter', 'roofUnit'] as const) this.addModule(key, modules[key]);
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
      const mesh = new InstancedMesh(material === this.resources.windowMaterial ? this.resources.windowGeometry : this.resources.unitBoxGeometry, material, instances.length);
      mesh.castShadow = material !== this.resources.windowMaterial && material !== this.resources.trimMaterial;
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

  private addModule(key: Parameters<typeof coreModels.geometry>[0], instances: readonly BoxInstance[]): void {
    const geometry = coreModels.geometry(key);
    if (!geometry || !instances.length) return;
    const mesh = new InstancedMesh(geometry, this.resources.moduleMaterial, instances.length);
    instances.forEach((instance, index) => mesh.setMatrixAt(index, createMatrix(instance)));
    mesh.castShadow = key !== 'facadeWindow'; mesh.receiveShadow = true;
    mesh.computeBoundingBox(); mesh.computeBoundingSphere(); this.group.add(mesh);
    // Instance buffers are chunk-owned. Geometry remains owned by CoreModels, material by World.
  }

  private addFacadeTreatment(b: BuildingData, trim: BoxInstance[], accents: BoxInstance[], modules: Record<'balcony' | 'awning' | 'entrySign' | 'planter' | 'roofUnit', BoxInstance[]>): void {
    const front = -b.depth / 2;
    const base = b.baseElevation;
    const add = (out: BoxInstance[], x: number, z: number, y: number, w: number, h: number, d: number) =>
      this.addLocalBox(out, b, x, z, base + y, w, h, d, b.rotation);
    // Open entrance surround. Never fill the opening of an enterable interior shell.
    const opening = interiorConfig.openingWidth;
    for (const side of [-1, 1]) add(trim, side * (opening / 2 + .12), front - .09, 1.42, .20, 2.84, .24);
    add(trim, 0, front - .09, 2.91, opening + .44, .18, .28);
    // Ground-floor cornice and corner piers give depth without changing the collider envelope.
    for (const y of [this.config.floorHeight, b.height - .10]) {
      add(trim, 0, front - .09, y, b.width + .22, .20, .28);
      for (const side of [-1, 1]) add(trim, side * (b.width / 2 + .06), 0, y, .22, .20, b.depth + .2);
    }
    for (const side of [-1, 1]) add(trim, side * (b.width / 2 - .12), front - .06, b.height / 2, .24, b.height, .14);
    const bays = calculateWindowGrid(b.width, b.floors, this.config.window.targetSpacing, this.config.window.minimumWidth);
    for (let bay = 3; bay < bays.columns; bay += 3) {
      const x = -b.width / 2 + bay * bays.horizontalSpacing;
      if (Math.abs(x) > opening) add(trim, x, front - .065, b.height / 2, .22, b.height, .16);
    }
    if (b.type === 'mixedUse') for (let floor = 3; floor < b.floors; floor += 3) {
      add(trim, 0, front - .055, floor * this.config.floorHeight, b.width + .12, .12, .20);
    }
    // A controlled inset-looking base course beside, not across, the entrance.
    const wing = Math.max(.1, (b.width - opening - .5) / 2);
    for (const side of [-1, 1]) add(accents, side * (opening / 2 + .25 + wing / 2), front - .035, .32, wing, .64, .08);
    if (b.type !== 'residential') {
      add(modules.entrySign, 0, front - .08, 3.38, Math.min(4.5, b.width * .45), 1, 1);
      // Repeating shop bays suit long commercial footprints while keeping the access door clear.
      for (let column = 0; column < bays.columns; column++) {
        const x = -b.width / 2 + (column + .5) * bays.horizontalSpacing;
        if (Math.abs(x) < opening + 1 || (column + b.seed) % 3 !== 0) continue;
        add(modules.awning, x, front - .08, 2.87, Math.min(3.5, bays.horizontalSpacing * .85), 1, 1);
      }
    } else {
      add(modules.awning, 0, front - .06, 3.12, Math.min(2.5, b.width * .3), .65, .65);
    }
    // Shallow balcony projections only; window bays remain deterministic from existing seed.
    if (b.type !== 'commercial') {
      for (let floor = 1; floor < b.floors; floor++) {
        if ((floor + b.seed) % 3 !== 0) continue;
        const grid = calculateWindowGrid(b.width, b.floors, this.config.window.targetSpacing, this.config.window.minimumWidth);
        for (let column = 0; column < grid.columns; column++) {
          if ((column + b.seed) % 2) continue;
          const x = -b.width / 2 + (column + .5) * grid.horizontalSpacing;
          add(modules.balcony, x, front - .04, floor * this.config.floorHeight + .65, Math.min(2.4, grid.horizontalSpacing * .78), 1, 1);
        }
      }
    }
    for (const side of [-1, 1]) add(modules.planter, side * Math.min(3.1, b.width / 2 - .8), front - .18, 0, 1, 1, .6);
    if (b.style.roof !== 'flat') {
      const roofY = b.height + (b.style.roof === 'parapet' ? .97 : .46);
      // Light coping defines the rooftop silhouette. Visual-only, matching the existing parapet.
      if (b.style.roof === 'parapet') {
        for (const side of [-1, 1]) {
          add(trim, 0, side * b.depth / 2, roofY, b.width + .6, .10, .40);
          add(trim, side * b.width / 2, 0, roofY, .40, .10, b.depth + .6);
        }
      }
      const count = Math.min(4, Math.max(1, Math.floor(b.width / 20)));
      for (let n = 0; n < count; n++) add(modules.roofUnit, (n - (count - 1) / 2) * Math.min(12, b.width / (count + 1)), b.depth * .22, b.height + .46, 2.1, 1.5, 1.8);
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
        const shop = floor === 0 && building.type !== 'residential';
        const width = shop ? Math.min(frontGrid.horizontalSpacing * .82, 3) : frontWindowWidth;
        if (floor === 0 && Math.abs(localX) < (interiorConfig.openingWidth + width * 1.08) / 2) continue;
        this.addLocalBox(windows, building, localX, -building.depth / 2 - this.config.window.depth / 2, shop ? building.baseElevation + 1.55 : y, width, shop ? 2.1 : this.config.window.height, this.config.window.depth, building.rotation);
      }
      for (const side of [-1, 1] as const) {
        for (let column = 0; column < sideGrid.columns; column += 1) {
          const localZ = -building.depth / 2 + (column + 0.5) * sideGrid.horizontalSpacing;
          this.addLocalBox(windows, building, side * (building.width / 2 + this.config.window.depth / 2), localZ, y, sideWindowWidth, this.config.window.height, this.config.window.depth, building.rotation - side * Math.PI / 2);
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
