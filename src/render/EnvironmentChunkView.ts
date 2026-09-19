import { Color, Group, InstancedMesh, Object3D } from 'three';
import type { Scene } from 'three';
import type { RoadPoint } from '../city/CityTypes';
import type { EnvironmentChunkData, EnvironmentProp } from '../environment/EnvironmentGenerator';
import { environmentConfig } from '../environment/EnvironmentConfig';
import type { EnvironmentResources } from './EnvironmentResources';

export class EnvironmentChunkView {
  public readonly group = new Group();
  public readonly propCount: number;
  private readonly batches: { mesh: InstancedMesh; large: boolean; count: number }[] = [];
  public constructor(public readonly data: EnvironmentChunkData, private readonly origin: RoadPoint, private readonly size: number, resources: EnvironmentResources) {
    this.group.name = `environment:${origin.x}:${origin.z}`;
    this.group.position.set(origin.x, 0, origin.z);
    this.propCount = data.props.length;
    const grouped = new Map<string, EnvironmentProp[]>();
    for (const prop of data.props) {
      const key = prop.kind === 'tree' ? `tree:${prop.variation % 2}` : prop.kind;
      const list = grouped.get(key) ?? []; list.push(prop); grouped.set(key, list);
    }
    const transform = new Object3D(); const tint = new Color();
    for (const [key, props] of grouped) {
      const geometry = resources.templates.get(key);
      if (!geometry) continue;
      const mesh = new InstancedMesh(geometry, resources.material, props.length);
      const large = key.startsWith('tree') || key === 'lamp';
      mesh.castShadow = large; mesh.receiveShadow = true;
      props.forEach((prop, index) => {
        transform.position.set(prop.x - origin.x, prop.y, prop.z - origin.z);
        transform.rotation.set(0, prop.yaw, 0);
        transform.scale.set(prop.scale, prop.scale * (key.startsWith('tree') ? 0.9 + (prop.variation % 7) * 0.035 : 1), prop.scale);
        transform.updateMatrix(); mesh.setMatrixAt(index, transform.matrix);
        const shade = 0.9 + (prop.variation % 11) * 0.01;
        mesh.setColorAt(index, tint.setRGB(shade, shade, shade));
      });
      mesh.computeBoundingBox(); mesh.computeBoundingSphere(); this.group.add(mesh);
      this.batches.push({ mesh, large, count: props.length });
    }
  }
  public addTo(scene: Scene): void { scene.add(this.group); }
  public updateVisibility(camera: RoadPoint): void {
    const dx = Math.max(this.origin.x - camera.x, 0, camera.x - this.origin.x - this.size);
    const dz = Math.max(this.origin.z - camera.z, 0, camera.z - this.origin.z - this.size);
    const distanceSquared = dx * dx + dz * dz;
    for (const batch of this.batches) {
      const range = (batch.large ? environmentConfig.largeDistance : environmentConfig.smallDistance)
        + (batch.mesh.visible ? environmentConfig.cullHysteresis : 0);
      batch.mesh.visible = distanceSquared <= range * range;
    }
  }
  public get visiblePropCount(): number { return this.batches.reduce((sum, batch) => sum + (batch.mesh.visible ? batch.count : 0), 0); }
  public dispose(scene: Scene): void {
    scene.remove(this.group); this.batches.forEach(({ mesh }) => mesh.dispose()); this.batches.length = 0; this.group.clear();
    // Only instance buffers belong here; geometry/material remain shared until World.dispose.
  }
}
