import { BufferAttribute, Mesh, MeshStandardMaterial } from 'three';
import type { BufferGeometry, Object3D } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ModelCache } from './ModelCache';
import type { ModelInstance } from './ModelCache';
import { modelCatalog } from './ModelCatalog';
import type { VehicleVisualModel } from '../VehicleAppearance';

type ModelKey = keyof typeof modelCatalog;

/** One bounded asset-library lease per model for Game lifetime. Views borrow shared resources.
 * Static models only; rigged/animated models should acquire their own ModelCache instances.
 * Street templates bake material colours into vertices to retain one draw per chunk/type.
 */
class CoreModels {
  private cache = new ModelCache();
  private readonly sources = new Map<ModelKey, ModelInstance>();
  private readonly merged = new Map<ModelKey, BufferGeometry>();
  private readonly vehiclePaints = new Map<number, MeshStandardMaterial>();
  private readonly vehicleDetails = new Map<string, MeshStandardMaterial>();
  public get resourceCounts(): Readonly<{ models: number; merged: number; paints: number }> {
    return { models: this.sources.size, merged: this.merged.size, paints: this.vehiclePaints.size };
  }
  public async initialize(): Promise<void> {
    await Promise.all((Object.keys(modelCatalog) as ModelKey[]).map(async key => {
      if (this.sources.has(key)) return;
      this.sources.set(key, await this.cache.acquire(modelCatalog[key].url));
    }));
  }
  public create(key: ModelKey): Object3D | undefined {
    const root = this.sources.get(key)?.root.clone(true);
    root?.traverse(object => { if (object instanceof Mesh) { object.castShadow = true; object.receiveShadow = true; } });
    return root;
  }
  /** Shared body paint palette and detail materials; instances own transforms only. */
  public createVehicle(variant: VehicleVisualModel, color?: number): Object3D | undefined {
    const root = this.create(variant);
    root?.traverse(object => {
      if (!(object instanceof Mesh) || !(object.material instanceof MeshStandardMaterial)) return;
      const material = object.material;
      const paint = material.name === 'MAT_SedanPetrol' || material.name === 'MAT_VehiclePaint';
      if (paint && color !== undefined) {
        let shared = this.vehiclePaints.get(color);
        if (!shared) { shared = material.clone(); shared.color.setHex(color); this.vehiclePaints.set(color, shared); }
        object.material = shared;
      } else if (!paint) {
        const shared = this.vehicleDetails.get(material.name);
        if (shared) object.material = shared;
        else this.vehicleDetails.set(material.name, material);
      }
    });
    return root;
  }
  public geometry(key: ModelKey): BufferGeometry | undefined {
    const cached = this.merged.get(key);
    if (cached) return cached;
    const root = this.sources.get(key)?.root;
    if (!root) return undefined; // Node tests/procedural fallback do not fetch browser assets.
    root.updateMatrixWorld(true);
    const parts: BufferGeometry[] = [];
    root.traverse(object => {
      if (!(object instanceof Mesh) || !(object.material instanceof MeshStandardMaterial)) return;
      const geometry = object.geometry.index ? object.geometry.toNonIndexed() : object.geometry.clone();
      geometry.applyMatrix4(object.matrixWorld);
      for (const name of Object.keys(geometry.attributes)) if (name !== 'position' && name !== 'normal') geometry.deleteAttribute(name);
      const count = geometry.getAttribute('position').count, colors = new Float32Array(count * 3), finish = new Float32Array(count * 2);
      for (let i = 0; i < count; i++) {
        object.material.color.toArray(colors, i * 3);
        finish[i * 2] = object.material.roughness; finish[i * 2 + 1] = object.material.metalness;
      }
      geometry.setAttribute('surfaceFinish', new BufferAttribute(finish, 2));
      geometry.setAttribute('color', new BufferAttribute(colors, 3)); parts.push(geometry);
    });
    const result = mergeGeometries(parts); parts.forEach(part => part.dispose());
    if (!result) return undefined;
    result.computeBoundingBox(); result.computeBoundingSphere(); this.merged.set(key, result);
    return result;
  }
  public dispose(): void {
    this.vehiclePaints.forEach(material => material.dispose()); this.vehiclePaints.clear();
    this.vehicleDetails.clear(); // References only; source leases own these materials.
    this.merged.forEach(geometry => geometry.dispose()); this.merged.clear();
    this.sources.clear(); this.cache.dispose(); this.cache = new ModelCache();
  }
}
export const coreModels = new CoreModels();
