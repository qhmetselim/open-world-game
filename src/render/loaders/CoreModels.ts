import { BufferAttribute, Mesh, MeshStandardMaterial } from 'three';
import type { BufferGeometry, Object3D } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ModelCache } from './ModelCache';
import type { ModelInstance } from './ModelCache';
import { modelCatalog } from './ModelCatalog';

type ModelKey = keyof typeof modelCatalog;

/** One bounded asset-library lease per model for Game lifetime. Views borrow shared resources.
 * Static models only; rigged/animated models should acquire their own ModelCache instances.
 * Street templates bake material colours into vertices to retain one draw per chunk/type.
 */
class CoreModels {
  private cache = new ModelCache();
  private readonly sources = new Map<ModelKey, ModelInstance>();
  private readonly merged = new Map<ModelKey, BufferGeometry>();
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
      const count = geometry.getAttribute('position').count, colors = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) object.material.color.toArray(colors, i * 3);
      geometry.setAttribute('color', new BufferAttribute(colors, 3)); parts.push(geometry);
    });
    const result = mergeGeometries(parts); parts.forEach(part => part.dispose());
    if (!result) return undefined;
    result.computeBoundingBox(); result.computeBoundingSphere(); this.merged.set(key, result);
    return result;
  }
  public dispose(): void {
    this.merged.forEach(geometry => geometry.dispose()); this.merged.clear();
    this.sources.clear(); this.cache.dispose(); this.cache = new ModelCache();
  }
}
export const coreModels = new CoreModels();
