import { Color, Group, InstancedBufferAttribute, InstancedMesh, Object3D } from 'three';
import type { Scene } from 'three';
import type { RoadPoint } from '../city/CityTypes';
import type { EnvironmentChunkData, EnvironmentProp } from '../environment/EnvironmentGenerator';
import type { EnvironmentResources } from './EnvironmentResources';
import { InstanceLod, visualLod } from './VisualLod';

export class EnvironmentChunkView {
  public readonly group = new Group();
  public readonly propCount: number;
  private readonly batches: { mesh: InstancedMesh; lod: InstanceLod }[] = [];
  public constructor(public readonly data: EnvironmentChunkData, origin: RoadPoint, _size: number, resources: EnvironmentResources) {
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
      const proxyGeometry = resources.templates.get(`${key}:proxy`);
      this.batches.push({ mesh, lod: new InstanceLod(mesh, large ? visualLod.silhouette : visualLod.smallProp, 0, proxyGeometry ? 0 : 1, origin.x, origin.z) });
      if (proxyGeometry) {
        const proxy = new InstancedMesh(proxyGeometry, resources.material, props.length);
        proxy.instanceMatrix.copy(mesh.instanceMatrix);
        proxy.instanceColor = mesh.instanceColor ? new InstancedBufferAttribute(new Float32Array(mesh.instanceColor.array), 3) : null;
        proxy.receiveShadow = true;
        proxy.visible = false;
        proxy.computeBoundingBox(); proxy.computeBoundingSphere(); this.group.add(proxy);
        this.batches.push({ mesh: proxy, lod: new InstanceLod(proxy, visualLod.silhouette, 1, 1, origin.x, origin.z) });
      }
    }
  }
  public addTo(scene: Scene): void { scene.add(this.group); }
  public updateVisibility(camera: RoadPoint): void {
    for (const batch of this.batches) batch.lod.update(camera);
  }
  public get visiblePropCount(): number { return this.batches.reduce((sum, batch) => sum + (batch.mesh.visible ? batch.mesh.count : 0), 0); }
  public dispose(scene: Scene): void {
    scene.remove(this.group); this.batches.forEach(({ mesh }) => mesh.dispose()); this.batches.length = 0; this.group.clear();
    // Only instance buffers belong here; geometry/material remain shared until World.dispose.
  }
}
