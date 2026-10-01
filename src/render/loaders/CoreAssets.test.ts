import { readFile } from 'node:fs/promises';
import { Box3, Group, Raycaster, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { expect, it } from 'vitest';
import { defaultGameConfig } from '../../core/Config';
import { getFrontWheelVisualSteering } from '../../vehicle/VehicleMovement';
import { ModelCache } from './ModelCache';
import { getMuzzle } from '../../combat/CombatState';
import { trafficVisualModel } from '../VehicleAppearance';

it('traffic appearance deterministically selects all civilian families without police or state mutation', () => {
  const seeds = Array.from({ length: 128 }, (_, i) => i * 7919);
  const first = seeds.map(trafficVisualModel);
  expect(new Set(first)).toEqual(new Set(['hatchback', 'sedan', 'crossover']));
  expect([...seeds].reverse().map(trafficVisualModel).reverse()).toEqual(first);
  expect(JSON.parse(JSON.stringify(seeds)).map(trafficVisualModel)).toEqual(first);
});

it('hatchback/crossover preserve chassis origin, shared axle clearance and distinct silhouettes', async () => {
  const heights: number[] = [];
  for (const kind of ['hatchback', 'crossover']) {
    const { cache, model } = await asset(`vehicles/${kind}`);
    expect(model.root.position.length()).toBe(0);
    model.root.updateMatrixWorld(true);
    const bounds = new Box3().setFromObject(model.root);
    expect(bounds.getSize(new Vector3()).z).toBeLessThan(4.4);
    expect(bounds.getSize(new Vector3()).x).toBeLessThan(2.21);
    heights.push(bounds.max.y);
    // A lateral ray through each actual physics axle must pass through the cut-out.
    for (const z of [-1.25, 1.25]) {
      const ray = new Raycaster(new Vector3(2, -.61876, z), new Vector3(-1, 0, 0), 0, 4);
      expect(ray.intersectObject(model.root, true)).toHaveLength(0);
    }
    cache.dispose();
  }
  expect(heights[1]! - heights[0]!).toBeGreaterThan(.2);
});

async function asset(path: string) {
  const bytes = await readFile(new URL(`../../../assets/models/${path}.glb`, import.meta.url));
  const cache = new ModelCache(async () => new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), ''));
  return { cache, model: await cache.acquire(path) };
}

it('Blender wheel uses the real sedan radius and X axle; spin preserves axle, steering uses existing sign', async () => {
  const { cache, model } = await asset('vehicles/wheel');
  const config = defaultGameConfig.vehicle.sedan;
  const bounds = new Box3().setFromObject(model.root), size = bounds.getSize(new Vector3());
  expect(size.y).toBeCloseTo(config.wheelRadius * 2, 5);
  expect(size.z).toBeCloseTo(config.wheelRadius * 2, 5);
  expect(bounds.getCenter(new Vector3()).length()).toBeLessThan(.00001);
  expect(size.x).toBeLessThan(.33);
  const pivot = new Group(); pivot.position.set(-config.trackWidth / 2, -config.chassisHeight / 2 - .29376, config.wheelBase / 2);
  pivot.add(model.root); model.root.rotation.x = 2.1; pivot.rotation.y = getFrontWheelVisualSteering(.3); pivot.updateMatrixWorld(true);
  const axle = new Vector3(1, 0, 0).transformDirection(model.root.matrixWorld);
  expect(axle.y).toBeCloseTo(0, 5); expect(axle.z).toBeGreaterThan(0); // Right steering = negative local yaw.
  expect(model.root.getWorldPosition(new Vector3()).y).toBeCloseTo(-.61876, 5);
  cache.dispose();
});

it('sedan and police share metre-scale body origin and distinguishable named coachwork', async () => {
  for (const kind of ['sedan', 'police']) {
    const { cache, model } = await asset(`vehicles/${kind}`);
    expect(model.root.position.length()).toBe(0);
    expect(model.root.getObjectByName(kind === 'sedan' ? 'BODY_Sedan' : 'BODY_Police')).toBeDefined();
    const size = new Box3().setFromObject(model.root).getSize(new Vector3());
    expect(size.z).toBeGreaterThan(4.2); expect(size.z).toBeLessThan(4.4);
    expect(size.x).toBeLessThan(2.21);
    cache.dispose();
  }
});

it('pistol muzzle pivot faces runtime -Z, with grip and slide behind the firing origin', async () => {
  const { cache, model } = await asset('weapons/pistol');
  const bounds = new Box3().setFromObject(model.root);
  expect(model.root.getObjectByName('WEAPON_Pistol')).toBeDefined();
  expect(bounds.min.z).toBeGreaterThan(-.01); expect(bounds.min.z).toBeLessThan(0);
  expect(bounds.max.z).toBeLessThan(.35); expect(bounds.min.y).toBeLessThan(-.24);
  expect(bounds.getSize(new Vector3()).x).toBeLessThan(.1);
  for (const aim of [new Vector3(0, 0, -1), new Vector3(.6, .3, -.8).normalize(), new Vector3(-.8, -.2, .3).normalize()]) {
    const muzzle = getMuzzle({ x: 12, y: 2, z: -5 }, aim);
    model.root.position.set(muzzle.x, muzzle.y, muzzle.z);
    model.root.quaternion.setFromUnitVectors(new Vector3(0, 0, -1), aim);
    model.root.updateMatrixWorld(true);
    expect(new Vector3(0, 0, -1).transformDirection(model.root.matrixWorld).distanceTo(aim)).toBeLessThan(.00001);
    expect(model.root.getWorldPosition(new Vector3()).distanceTo(new Vector3(muzzle.x, muzzle.y, muzzle.z))).toBeLessThan(.00001);
  }
  cache.dispose();
});

it('city facade module projects outward from -Z and preserves unit bay dimensions', async () => {
  const { cache, model } = await asset('city/facade-window');
  const bounds = new Box3().setFromObject(model.root);
  expect(bounds.max.z).toBeLessThan(.001);
  expect(bounds.min.z).toBeGreaterThan(-.3);
  expect(bounds.getSize(new Vector3()).x).toBeCloseTo(1.08, 4);
  expect(bounds.getSize(new Vector3()).y).toBeLessThan(1.1);
  cache.dispose();
});

it('Blender vegetation stays within the existing roadside clearance envelope', async () => {
  for (const kind of ['tree-broad', 'tree-column', 'bush']) {
    const { cache, model } = await asset(`city/${kind}`);
    const bounds = new Box3().setFromObject(model.root);
    expect(bounds.min.y).toBeGreaterThan(-.12);
    expect(Math.max(Math.abs(bounds.min.x), Math.abs(bounds.max.x), Math.abs(bounds.min.z), Math.abs(bounds.max.z))).toBeLessThan(2.2);
    expect(bounds.max.y).toBeLessThan(7);
    cache.dispose();
  }
});
