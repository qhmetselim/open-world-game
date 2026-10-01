import { BoxGeometry, Color, Group, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, Scene, Vector3 } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { InstanceLod, registerEntityLod, registerVisualLod, selectVisualTier, updateVisualLods, visualLod } from './VisualLod';
import { EnvironmentResources } from './EnvironmentResources';
import { coreModels } from './loaders/CoreModels';

describe('render-only detail policy', () => {
  it('holds each tier around both boundaries rather than oscillating', () => {
    const ranges = { near: 100, far: 200 };
    expect(selectVisualTier(105, 0, ranges)).toBe(0);
    expect(selectVisualTier(111, 0, ranges)).toBe(1);
    expect(selectVisualTier(95, 1, ranges)).toBe(1);
    expect(selectVisualTier(89, 1, ranges)).toBe(0);
    expect(selectVisualTier(205, 1, ranges)).toBe(1);
    expect(selectVisualTier(211, 1, ranges)).toBe(2);
    expect(selectVisualTier(195, 2, ranges)).toBe(2);
    expect(selectVisualTier(189, 2, ranges)).toBe(1);
  });
  it('compacts transforms AND tint, restores on return, and keeps conservative bounds/shared resources', () => {
    const geometry = new BoxGeometry(), material = new MeshBasicMaterial();
    const mesh = new InstancedMesh(geometry, material, 2);
    mesh.setMatrixAt(0, new Matrix4().makeTranslation(-300, 0, 0));
    mesh.setMatrixAt(1, new Matrix4().makeTranslation(10, 0, 0));
    mesh.setColorAt(0, new Color('red')); mesh.setColorAt(1, new Color('blue'));
    mesh.computeBoundingSphere(); const radius = mesh.boundingSphere!.radius;
    const lod = new InstanceLod(mesh, { near: 100, far: 200 });
    lod.update({ x: 0, z: 0 });
    expect(mesh.count).toBe(1);
    const matrix = new Matrix4(), color = new Color(); mesh.getMatrixAt(0, matrix); mesh.getColorAt(0, color);
    expect(matrix.elements[12]).toBe(10); expect(color.getHex()).toBe(0x0000ff);
    lod.update({ x: -300, z: 0 }); mesh.getColorAt(0, color);
    expect(mesh.count).toBe(1); expect(color.getHex()).toBe(0xff0000);
    expect(mesh.geometry).toBe(geometry); expect(mesh.material).toBe(material);
    expect(mesh.boundingSphere!.radius).toBe(radius);
    mesh.dispose(); geometry.dispose(); material.dispose();
  });
  it('near and mid instance sets are complementary through repeated approach/retreat', () => {
    const geometry = new BoxGeometry(), material = new MeshBasicMaterial();
    const near = new InstancedMesh(geometry, material, 1), mid = new InstancedMesh(geometry, material, 1);
    near.setMatrixAt(0, new Matrix4()); mid.setMatrixAt(0, new Matrix4());
    const a = new InstanceLod(near, visualLod.building), b = new InstanceLod(mid, visualLod.building, 1, 1);
    for (const x of [0, 110, 124, 126, 130, 118, 104, 250, 256, 240, 234, 0]) {
      a.update({ x, z: 0 }); b.update({ x, z: 0 });
      expect(near.count + mid.count).toBeLessThanOrEqual(1);
      if (x < 230) expect(near.count + mid.count).toBe(1);
    }
    near.dispose(); mid.dispose(); geometry.dispose(); material.dispose();
  });
  it('unregisters unloaded views and respects externally hidden/taken-over vehicles', () => {
    const scene = new Scene(), update = vi.fn();
    const remove = registerVisualLod(scene, update);
    updateVisualLods(scene, new Vector3()); expect(update).toHaveBeenCalledTimes(1);
    remove(); updateVisualLods(scene, new Vector3()); expect(update).toHaveBeenCalledTimes(1);
    const root = new Group(), mesh = new Mesh(new BoxGeometry(), new MeshBasicMaterial());
    mesh.castShadow = true; root.add(mesh); let enabled = false;
    const dispose = registerEntityLod(scene, root, visualLod.vehicle, () => enabled);
    updateVisualLods(scene, new Vector3()); expect(root.visible).toBe(false);
    enabled = true; updateVisualLods(scene, new Vector3()); expect(root.visible).toBe(true);
    updateVisualLods(scene, new Vector3(160, 0, 0)); expect(mesh.castShadow).toBe(false); expect(root.visible).toBe(true);
    updateVisualLods(scene, new Vector3(250, 0, 0)); expect(root.visible).toBe(false);
    dispose(); mesh.geometry.dispose(); mesh.material.dispose();
  });
  it('shares lightweight silhouette proxies and disposes their owned geometry', () => {
    const resources = new EnvironmentResources();
    const proxy = resources.templates.get('tree:0:proxy')!;
    const dispose = vi.fn(); proxy.addEventListener('dispose', dispose);
    expect(proxy.getAttribute('position').count / 3).toBeLessThan(150);
    expect(proxy.getAttribute('surfaceFinish').count).toBe(proxy.getAttribute('position').count);
    resources.dispose(); expect(dispose).toHaveBeenCalledTimes(1);
  });
  it('borrows cached GLB geometry without a clone or premature disposal', () => {
    const shared = new BoxGeometry(), dispose = vi.fn(); shared.addEventListener('dispose', dispose);
    const library = vi.spyOn(coreModels, 'geometry').mockImplementation(key => key === 'streetLampTest' ? shared : undefined);
    const resources = new EnvironmentResources();
    try {
      resources.applyModels(); resources.applyModels();
      expect(resources.templates.get('lamp')).toBe(shared);
      resources.dispose(); expect(dispose).not.toHaveBeenCalled();
    } finally { library.mockRestore(); shared.dispose(); }
  });
});
