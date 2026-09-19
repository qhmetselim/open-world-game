import { BoxGeometry, BufferAttribute, Color, ConeGeometry, CylinderGeometry, IcosahedronGeometry, MeshStandardMaterial } from 'three';
import type { BufferGeometry } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { visualTheme } from './VisualTheme';

/** Nine reusable, vertex-coloured templates and one opaque material for the entire world. */
export class EnvironmentResources {
  public readonly material = new MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });
  public readonly templates = new Map<string, BufferGeometry>();
  public constructor() {
    const palette = visualTheme.environment;
    const vegetation = visualTheme.vegetation;
    let parts: BufferGeometry[] = [];
    const part = (source: BufferGeometry, x: number, y: number, z: number, color: number) => {
      const geometry = source.index ? source.toNonIndexed() : source.clone();
      source.dispose(); geometry.deleteAttribute('uv'); geometry.translate(x, y, z);
      const positions = geometry.getAttribute('position'); const colors = new Float32Array(positions.count * 3); const tint = new Color(color);
      for (let index = 0; index < positions.count; index++) tint.toArray(colors, index * 3);
      geometry.setAttribute('color', new BufferAttribute(colors, 3)); parts.push(geometry);
    };
    const box = (x: number, y: number, z: number, w: number, h: number, d: number, color: number) => part(new BoxGeometry(w, h, d), x, y, z, color);
    const pole = (x: number, y: number, z: number, radius: number, height: number, color: number) => part(new CylinderGeometry(radius * 0.8, radius, height, 6), x, y, z, color);
    const finish = (key: string) => {
      const merged = mergeGeometries(parts);
      if (!merged) throw new Error(`Could not build environment template ${key}`);
      merged.computeBoundingBox(); merged.computeBoundingSphere();
      this.templates.set(key, merged); parts.forEach((geometry) => geometry.dispose()); parts = [];
    };
    pole(0, 1.7, 0, 0.22, 3.8, vegetation.bark);
    part(new IcosahedronGeometry(2.1, 0), 0, 4.0, 0, vegetation.leaf);
    part(new IcosahedronGeometry(1.5, 0), 0.65, 5.1, 0.1, palette.leafLight);
    finish('tree:0');
    pole(0, 1.9, 0, 0.2, 4.2, vegetation.bark);
    part(new ConeGeometry(2.2, 3.4, 7), 0, 3.9, 0, palette.leafDark);
    part(new ConeGeometry(1.7, 3.0, 7), 0, 5.5, 0, vegetation.leaf);
    finish('tree:1');
    part(new IcosahedronGeometry(0.85, 0), 0, 0.55, 0, palette.leafDark);
    part(new IcosahedronGeometry(0.55, 0), 0.45, 0.7, 0.1, vegetation.leaf);
    finish('bush');
    pole(0, 2.8, 0, 0.085, 5.8, palette.metal);
    box(0, 5.55, 0.45, 0.1, 0.1, 1.0, palette.metal);
    box(0, 5.49, 0.95, 0.36, 0.2, 0.5, palette.metal);
    box(0, 5.38, 0.95, 0.28, 0.035, 0.42, palette.lamp);
    finish('lamp');
    box(0, 0.52, 0, 1.9, 0.12, 0.58, palette.wood);
    box(0, 0.98, -0.25, 1.9, 0.55, 0.1, palette.wood);
    for (const x of [-0.65, 0.65]) box(x, 0.21, 0, 0.12, 0.62, 0.45, palette.metal);
    finish('bench');
    pole(0, 0.45, 0, 0.32, 1.1, palette.metal);
    pole(0, 1.0, 0, 0.36, 0.12, palette.stone);
    box(0, 0.85, 0.305, 0.23, 0.12, 0.03, palette.leafDark);
    finish('bin');
    pole(0, 1.2, 0, 0.055, 2.6, palette.metal);
    box(0, 2.15, 0, 1.05, 0.55, 0.07, palette.sign);
    // Simple directional arrow, geometry only; this sign has no traffic-rule semantics.
    box(-0.09, 2.15, 0.045, 0.52, 0.065, 0.02, palette.signFace);
    const arrow = new ConeGeometry(0.17, 0.24, 3); arrow.rotateZ(-Math.PI / 2);
    part(arrow, 0.28, 2.15, 0.04, palette.signFace);
    finish('sign');
    pole(0, 0.4, 0, 0.14, 1.0, palette.metal);
    pole(0, 0.79, 0, 0.145, 0.12, palette.lamp);
    finish('bollard');
    box(0, 0.5, 0, 0.85, 1.2, 0.55, palette.stone);
    box(0, 0.52, 0.29, 0.72, 0.87, 0.04, palette.metal);
    box(0.24, 0.56, 0.325, 0.05, 0.17, 0.025, palette.lamp);
    finish('utility');
  }
  public dispose(): void { this.templates.forEach((geometry) => geometry.dispose()); this.templates.clear(); this.material.dispose(); }
}
