import { Matrix4, Mesh } from 'three';
import type { InstancedMesh, Object3D, Scene, Vector3 } from 'three';

/** Render-only distances (metres). Never used for simulation activation or streaming focus. */
export const visualLod = {
  hysteresis: 10,
  building: { near: 115, far: 245 },
  smallProp: { near: 90, far: 120 },
  silhouette: { near: 180, far: 285 },
  vehicle: { near: 130, far: 205 },
  character: { near: 100, far: 145 },
  shadowDistance: 80
} as const;
export interface LodRanges { readonly near: number; readonly far: number }
export function selectVisualTier(distance: number, previous: number, ranges: LodRanges): number {
  const h = visualLod.hysteresis;
  if (distance > ranges.far + (previous === 2 ? -h : h)) return 2;
  if (distance > ranges.near + (previous === 0 ? h : -h)) return 1;
  return 0;
}

type Update = (position: Readonly<Vector3>) => void;
const views = new WeakMap<Scene, Set<Update>>();
export function registerVisualLod(scene: Scene, update: Update): () => void {
  let entries = views.get(scene);
  if (!entries) { entries = new Set(); views.set(scene, entries); }
  entries.add(update);
  return () => { entries.delete(update); };
}
export function updateVisualLods(scene: Scene, position: Readonly<Vector3>): void {
  views.get(scene)?.forEach(update => update(position));
}
export function visualLodRegistrationCount(scene: Scene): number { return views.get(scene)?.size ?? 0; }

/** Preserve shared meshes/materials and all animation/physics transforms. */
export function registerEntityLod(scene: Scene, root: Object3D, ranges: LodRanges, enabled: () => boolean = () => true): () => void {
  let tier = 0;
  const casters: Mesh[] = [];
  root.traverse(object => { if (object instanceof Mesh && object.castShadow) casters.push(object); });
  return registerVisualLod(scene, camera => {
    const distance = Math.hypot(root.position.x - camera.x, root.position.z - camera.z);
    tier = selectVisualTier(distance, tier, ranges);
    root.visible = enabled() && tier !== 2;
    for (const mesh of casters) mesh.castShadow = distance < visualLod.shadowDistance && !(Array.isArray(mesh.material) ? mesh.material : [mesh.material]).some(material => material.transparent);
  });
}

/** Compact only changed instance sets; no per-frame allocations or GPU geometry clones.
 * Bounds deliberately remain the original conservative bounds, valid for every subset. */
export class InstanceLod {
  private readonly matrices: Float32Array;
  private readonly colors: Float32Array | undefined;
  private readonly tiers: Uint8Array;
  private readonly included: Uint8Array;
  private readonly scratch = new Matrix4();
  private initialized = false;
  private lastX = Infinity;
  private lastZ = Infinity;
  private readonly castsShadow: boolean;
  public constructor(private readonly mesh: InstancedMesh, private readonly ranges: LodRanges,
    private readonly minimumTier = 0, private readonly maximumTier = 0,
    private readonly originX = 0, private readonly originZ = 0) {
    this.matrices = new Float32Array(mesh.instanceMatrix.array);
    this.colors = mesh.instanceColor ? new Float32Array(mesh.instanceColor.array) : undefined;
    this.tiers = new Uint8Array(mesh.count);
    this.included = new Uint8Array(mesh.count);
    this.castsShadow = mesh.castShadow;
  }
  public update(camera: Readonly<{ x: number; z: number }>): void {
    if (Math.abs(camera.x - this.lastX) + Math.abs(camera.z - this.lastZ) < 1) return;
    this.lastX = camera.x; this.lastZ = camera.z;
    let changed = !this.initialized, nearest = Infinity;
    for (let i = 0; i < this.tiers.length; i++) {
      const distance = Math.hypot(this.matrices[i * 16 + 12]! + this.originX - camera.x,
        this.matrices[i * 16 + 14]! + this.originZ - camera.z);
      const tier = selectVisualTier(distance, this.tiers[i]!, this.ranges);
      this.tiers[i] = tier;
      const include = Number(tier >= this.minimumTier && tier <= this.maximumTier);
      // Large building volumes may cast into the near shadow frustum with a distant centre.
      const extent = .5 * (Math.hypot(this.matrices[i * 16]!, this.matrices[i * 16 + 2]!)
        + Math.hypot(this.matrices[i * 16 + 8]!, this.matrices[i * 16 + 10]!));
      if (include) nearest = Math.min(nearest, distance - extent);
      if (include !== this.included[i]) changed = true;
      this.included[i] = include;
    }
    this.mesh.castShadow = this.castsShadow && nearest < visualLod.shadowDistance;
    if (!changed) return;
    let count = 0;
    for (let i = 0; i < this.tiers.length; i++) if (this.included[i]) {
      this.mesh.setMatrixAt(count, this.scratch.fromArray(this.matrices, i * 16));
      if (this.colors && this.mesh.instanceColor) this.mesh.instanceColor.setXYZ(count, this.colors[i * 3]!, this.colors[i * 3 + 1]!, this.colors[i * 3 + 2]!);
      count++;
    }
    this.mesh.count = count; this.mesh.visible = count > 0;
    this.mesh.instanceMatrix.needsUpdate = true; this.initialized = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}
