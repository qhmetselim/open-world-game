import { readFile } from 'node:fs/promises';
import { Box3, Mesh, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { expect, it } from 'vitest';
import { ModelCache } from './ModelCache';

async function parseLamp(): Promise<GLTF> {
  const bytes = await readFile(new URL('../../../assets/models/props/street-lamp-test.glb', import.meta.url));
  return new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
}

it('exported Blender lamp has metre scale, Y-up height, foot pivot and three shared material primitives', async () => {
  const source = await parseLamp(), cache = new ModelCache(async () => source);
  const instance = await cache.acquire('lamp');
  const bounds = new Box3().setFromObject(instance.root), size = bounds.getSize(new Vector3());
  expect(bounds.min.y).toBeCloseTo(0, 5);
  expect(size.y).toBeCloseTo(4.89, 4);
  expect(size.x).toBeLessThan(0.6);
  expect(bounds.max.z).toBeGreaterThan(1); // Blender -Y arm -> glTF +Z.
  expect(instance.root.getObjectByName('PROP_StreetLamp_Test')).toBeDefined();
  const names = new Set<string>(); let triangles = 0;
  instance.root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    for (const mat of Array.isArray(object.material) ? object.material : [object.material]) names.add(mat.name);
    triangles += object.geometry.index!.count / 3;
  });
  expect([...names].sort()).toEqual(['MAT_StreetLamp_Lens', 'MAT_StreetLamp_Metal', 'MAT_StreetLamp_Trim']);
  expect(triangles).toBe(216);
  cache.dispose();
});

it('concurrent instances share one load/resources, independent transforms and last-release eviction', async () => {
  let loads = 0;
  const cache = new ModelCache(async () => { loads++; return parseLamp(); });
  const [a, b] = await Promise.all([cache.acquire('lamp'), cache.acquire('lamp')]);
  expect(loads).toBe(1); expect(a.root).not.toBe(b.root);
  a.root.position.x = 5; expect(b.root.position.x).toBe(0);
  let geometryDisposed = 0;
  a.root.traverse((object) => { if (object instanceof Mesh) object.geometry.addEventListener('dispose', () => { geometryDisposed++; }); });
  a.release(); expect(geometryDisposed).toBe(0);
  b.release(); expect(geometryDisposed).toBe(3);
  b.release(); expect(geometryDisposed).toBe(3);
  await cache.acquire('lamp'); expect(loads).toBe(2); cache.dispose();
});

it('failed loads can retry and dispose during an in-flight load releases late resources', async () => {
  let attempts = 0;
  const cache = new ModelCache(async () => { if (++attempts === 1) throw new Error('missing'); return parseLamp(); });
  await expect(cache.acquire('lamp')).rejects.toThrow('missing');
  const instance = await cache.acquire('lamp'); instance.release(); cache.dispose();
  const source = await parseLamp(); let disposed = 0;
  source.scene.traverse((object) => { if (object instanceof Mesh) object.geometry.addEventListener('dispose', () => { disposed++; }); });
  let complete!: (source: GLTF) => void;
  const late = new ModelCache(() => new Promise(resolve => { complete = resolve; }));
  const request = late.acquire('lamp'); await Promise.resolve(); late.dispose(); complete(source);
  await expect(request).rejects.toThrow('disposed during load'); expect(disposed).toBe(3);
});
