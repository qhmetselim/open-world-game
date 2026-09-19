import { BoxGeometry, Group, InstancedMesh, Matrix4, MeshStandardMaterial, Vector3 } from 'three';
import type { Scene } from 'three';
import type { PhysicsWorld } from '../physics/PhysicsWorld';
import { visualTheme } from '../render/VisualTheme';
import { distanceToInterior, interiorConfig } from './InteriorLayout';
import type { InteriorBox, InteriorLayout } from './InteriorLayout';

/** Proximity-owned room resources. The building shell/foundation remain world-owned. */
export class InteriorRuntime {
  private readonly geometry = new BoxGeometry(1, 1, 1);
  private readonly materials = [visualTheme.interior.wall, visualTheme.interior.floor, visualTheme.interior.ceiling]
    .map((color) => new MeshStandardMaterial({ color, roughness: .95 }));
  private readonly active = new Map<string, { group: Group; body: ReturnType<PhysicsWorld['createStaticCompound']> }>();

  public update(layouts: readonly InteriorLayout[], position: { x: number; z: number }, scene: Scene, physics: PhysicsWorld): void {
    const retained = new Set(layouts.map((layout) => layout.building.id));
    for (const id of this.active.keys()) if (!retained.has(id)) this.remove(id, scene, physics);
    for (const layout of layouts) {
      const id = layout.building.id, distance = distanceToInterior(layout, position);
      if (this.active.has(id)) {
        if (distance > interiorConfig.deactivationDistance) this.remove(id, scene, physics);
      } else if (distance <= interiorConfig.activationDistance) this.add(layout, scene, physics);
    }
  }
  public get count(): number { return this.active.size; }
  public remove(id: string, scene: Scene, physics: PhysicsWorld): void {
    const entry = this.active.get(id); if (!entry) return;
    scene.remove(entry.group);
    for (const mesh of entry.group.children) if (mesh instanceof InstancedMesh) mesh.dispose();
    entry.group.clear(); physics.removeRigidBody(entry.body); this.active.delete(id);
  }
  public dispose(scene: Scene, physics: PhysicsWorld): void {
    for (const id of this.active.keys()) this.remove(id, scene, physics);
    this.geometry.dispose(); for (const material of this.materials) material.dispose();
  }
  private add(layout: InteriorLayout, scene: Scene, physics: PhysicsWorld): void {
    const b = layout.building, slab = interiorConfig.slabThickness;
    // Foundation already supplies floor collision. A thin finish avoids coplanar surfaces.
    const floor: InteriorBox = { x: 0, y: .005, z: 0, width: b.width - .4, height: .01, depth: b.depth - .4 };
    const ceiling: InteriorBox = { x: 0, y: layout.floorHeight - slab / 2, z: 0, width: b.width, height: slab, depth: b.depth };
    const group = new Group(); group.position.set(b.x, b.baseElevation, b.z); group.rotation.y = b.rotation;
    const batches = [layout.rooms, [floor, layout.ramp], [ceiling]];
    batches.forEach((boxes, index) => {
      const mesh = new InstancedMesh(this.geometry, this.materials[index], boxes.length);
      boxes.forEach((box, i) => mesh.setMatrixAt(i, new Matrix4().makeRotationX(box.pitch ?? 0)
        .scale(new Vector3(box.width, box.height, box.depth)).setPosition(box.x, box.y, box.z)));
      mesh.computeBoundingSphere(); mesh.computeBoundingBox(); mesh.receiveShadow = true; mesh.castShadow = true;
      group.add(mesh);
    });
    const body = physics.createStaticCompound([b.x, b.baseElevation, b.z], b.rotation, [...layout.rooms, ceiling, layout.ramp]);
    scene.add(group); this.active.set(b.id, { group, body });
  }
}
