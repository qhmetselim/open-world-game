import { Mesh, Texture } from 'three';
import type { AnimationClip, Material, Object3D, SkinnedMesh } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';

export interface ModelInstance {
  readonly root: Object3D;
  readonly animations: readonly AnimationClip[];
  /** Detach this instance; the last release also evicts/disposes its source asset. */
  release(): void;
}
interface Entry { promise: Promise<GLTF>; source?: GLTF; references: number; disposed: boolean }

/** URL-keyed, in-flight deduplicated cache. Instances own transforms/skeletons;
 * the cache owns shared geometry/materials/textures. Never mutate shared materials. */
export class ModelCache {
  private readonly entries = new Map<string, Entry>();
  private readonly instances = new Set<ModelInstance>();
  private closed = false;
  public constructor(private readonly load: (url: string) => Promise<GLTF> = (url) => new GLTFLoader().loadAsync(url)) {}

  public async acquire(url: string): Promise<ModelInstance> {
    if (this.closed) throw new Error('ModelCache is disposed');
    let entry = this.entries.get(url);
    if (!entry) {
      const created: Entry = { promise: Promise.resolve().then(() => this.load(url)), references: 0, disposed: false };
      created.promise = created.promise.then((source) => {
        created.source = source;
        if (this.closed) this.disposeSource(created);
        return source;
      });
      this.entries.set(url, created);
      entry = created;
    }
    const owned = entry;
    owned.references++;
    const drop = () => {
      if (--owned.references === 0) {
        if (this.entries.get(url) === owned) this.entries.delete(url);
        this.disposeSource(owned);
      }
    };
    try {
      const source = await owned.promise;
      if (this.closed) throw new Error('ModelCache disposed during load');
      // SkeletonUtils supports future rigged assets without sharing animated bone state.
      const root = clone(source.scene);
      let released = false;
      const instance: ModelInstance = { root, animations: source.animations, release: () => {
        if (released) return;
        released = true;
        root.removeFromParent();
        root.traverse((object) => {
          if ('isSkinnedMesh' in object && object.isSkinnedMesh && 'skeleton' in object) {
            (object as SkinnedMesh).skeleton.dispose();
          }
        });
        this.instances.delete(instance);
        drop();
      } };
      this.instances.add(instance);
      return instance;
    } catch (error) {
      drop(); // Failed loads may be retried; they never poison the cache.
      throw error;
    }
  }

  public dispose(): void {
    if (this.closed) return;
    this.closed = true;
    for (const instance of this.instances) instance.release();
    for (const entry of this.entries.values()) this.disposeSource(entry);
    this.entries.clear(); // Pending load completions are disposed by their promise handler.
  }

  private disposeSource(entry: Entry): void {
    if (!entry.source || entry.disposed) return;
    entry.disposed = true;
    const geometry = new Set<Mesh['geometry']>(), materials = new Set<Material>(), textures = new Set<Texture>();
    for (const scene of entry.source.scenes) scene.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      geometry.add(object.geometry);
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        materials.add(material);
        for (const value of Object.values(material)) if (value instanceof Texture) textures.add(value);
      }
    });
    geometry.forEach((value) => value.dispose());
    materials.forEach((value) => value.dispose());
    textures.forEach((value) => value.dispose());
  }
}
