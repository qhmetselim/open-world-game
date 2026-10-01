import { Color, DataUtils, DirectionalLight, PerspectiveCamera } from 'three';
import { expect, it } from 'vitest';
import { createDaylightEnvironment } from './DaylightEnvironment';
import { SceneManager } from './SceneManager';
import { visualTheme } from './VisualTheme';

it('daylight uses a small finite deterministic linear HDR environment', () => {
  const a = createDaylightEnvironment(), b = createDaylightEnvironment();
  expect(a.image.width).toBe(256); expect(a.image.height).toBe(128);
  expect(a.image.data).toEqual(b.image.data);
  expect(Array.from(a.image.data as Uint16Array).every(value => Number.isFinite(DataUtils.fromHalfFloat(value)))).toBe(true);
  a.dispose(); b.dispose();
});

it('scene owns and disposes its environment and uses the sky horizon for fog', () => {
  const manager = new SceneManager();
  let disposed = 0;
  manager.scene.environment!.addEventListener('dispose', () => disposed++);
  expect(manager.scene.fog!.color.equals(new Color(visualTheme.sky.horizon))).toBe(true);
  manager.dispose();
  expect(disposed).toBe(1); expect(manager.scene.environment).toBeNull();
});

it('near shadow budget is fixed and follows the camera without changing camera transforms', () => {
  const manager = new SceneManager(), camera = new PerspectiveCamera();
  const sun = manager.scene.children.find(child => child instanceof DirectionalLight) as DirectionalLight;
  camera.position.set(-123, 7, 241); camera.rotation.set(.1, .5, 0);
  const before = camera.position.clone(), rotation = camera.quaternion.clone();
  manager.update(camera);
  expect(camera.position.equals(before)).toBe(true); expect(camera.quaternion.equals(rotation)).toBe(true);
  expect(sun.shadow.mapSize.x).toBe(2048);
  expect(sun.target.position.distanceTo(before)).toBeLessThan(.08);
  const offset = sun.position.clone().sub(sun.target.position);
  expect(offset.x).toBeCloseTo(-65, 8); expect(offset.y).toBeCloseTo(95, 8); expect(offset.z).toBeCloseTo(45, 8);
  manager.dispose();
});
