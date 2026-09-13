import { BoxGeometry, BufferAttribute, Color, CylinderGeometry } from 'three';
import { visualTheme } from './VisualTheme';

/** A raked windscreen silhouette, using the same eight-corner primitive and physics-independent dimensions. */
export function createSedanCabin(width: number, height: number, length: number): BoxGeometry {
  const geometry = new BoxGeometry(width, height, length);
  const positions = geometry.getAttribute('position');
  for (let index = 0; index < positions.count; index++) {
    if (positions.getY(index) > 0) positions.setXYZ(index, positions.getX(index) * 0.86, positions.getY(index), positions.getZ(index) * 0.64);
  }
  geometry.computeVertexNormals();
  return geometry;
}

/** Shared cap colours give wheels readable hubs without extra meshes or draw calls. */
export function createSedanWheel(radius: number, width: number, segments: number): CylinderGeometry {
  const geometry = new CylinderGeometry(radius, radius, width, segments);
  const positions = geometry.getAttribute('position');
  const normals = geometry.getAttribute('normal');
  const colors = new Float32Array(positions.count * 3);
  const tire = new Color(visualTheme.vehicle.tire);
  const rim = new Color(visualTheme.vehicle.rim);
  const edge = new Color(visualTheme.vehicle.rimEdge);
  for (let index = 0; index < positions.count; index++) {
    const cap = Math.abs(normals.getY(index)) > 0.5;
    const centre = Math.hypot(positions.getX(index), positions.getZ(index)) < radius * 0.5;
    (cap ? centre ? rim : edge : tire).toArray(colors, index * 3);
  }
  geometry.setAttribute('color', new BufferAttribute(colors, 3));
  return geometry;
}
