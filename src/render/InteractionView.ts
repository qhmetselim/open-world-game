import { BoxGeometry, Color, InstancedMesh, MeshStandardMaterial, Object3D } from 'three';
import type { Scene } from 'three';
import type { Interactable, InteractionConfig, InteractionState } from '../interaction/InteractionState';
import { doorTransform } from '../interaction/InteractionState';
import { vestibuleBoxes } from '../interaction/InteractionGeometry';
import { visualTheme } from './VisualTheme';

export class InteractionRenderResources {
  public readonly cube = new BoxGeometry(1, 1, 1);
  public readonly material = new MeshStandardMaterial({ color: 0xffffff, roughness: .8 });
  public dispose(): void { this.cube.dispose(); this.material.dispose(); }
}

export class InteractionView {
  private readonly moving: InstancedMesh;
  private readonly frame: InstancedMesh | undefined;
  private lastOn = false;
  public constructor(private readonly scene: Scene, private readonly item: Interactable, private readonly config: InteractionConfig, resources: InteractionRenderResources) {
    const transform = new Object3D();
    const set = (mesh: InstancedMesh, index: number, x: number, y: number, z: number, w: number, h: number, d: number, color: number) => {
      transform.position.set(x, y, z); transform.scale.set(w, h, d); transform.updateMatrix();
      mesh.setMatrixAt(index, transform.matrix); mesh.setColorAt(index, new Color(color));
    };
    this.moving = new InstancedMesh(resources.cube, resources.material, 2);
    if (item.type === 'door') {
      set(this.moving, 0, 0, 0, 0, config.doorWidth, config.doorHeight, config.doorThickness, visualTheme.interaction.door);
      set(this.moving, 1, config.doorWidth * .35, 0, config.doorThickness, .07, .22, .07, visualTheme.interaction.handle);
      const boxes = vestibuleBoxes(config);
      this.frame = new InstancedMesh(resources.cube, resources.material, boxes.length);
      boxes.forEach((box, index) => set(this.frame!, index, box.x, box.y, box.z, box.width, box.height, box.depth, visualTheme.interaction.frame));
      this.frame.castShadow = true; this.frame.receiveShadow = true;
      this.frame.position.set(item.position.x, item.position.y, item.position.z); this.frame.rotation.y = item.yaw;
      this.frame.computeBoundingSphere(); this.frame.computeBoundingBox(); scene.add(this.frame);
    } else {
      set(this.moving, 0, 0, .5, 0, .36, 1, .36, visualTheme.interaction.pedestal);
      set(this.moving, 1, 0, 1.08, 0, .44, .16, .44, visualTheme.interaction.off);
      this.moving.position.set(item.position.x, item.position.y, item.position.z);
    }
    this.moving.castShadow = true; this.moving.receiveShadow = true;
    this.moving.computeBoundingBox(); this.moving.computeBoundingSphere(); scene.add(this.moving);
  }
  public update(state: InteractionState, previousAmount: number, alpha: number): void {
    if (this.item.type === 'door') {
      const transform = doorTransform(this.item, previousAmount + (state.amount - previousAmount) * alpha, this.config);
      this.moving.position.set(transform.position.x, transform.position.y, transform.position.z); this.moving.rotation.y = transform.yaw;
    } else if (state.on !== this.lastOn) {
      this.lastOn = state.on;
      this.moving.setColorAt(1, new Color(state.on ? visualTheme.interaction.on : visualTheme.interaction.off));
      if (this.moving.instanceColor) this.moving.instanceColor.needsUpdate = true;
    }
  }
  public dispose(): void {
    this.scene.remove(this.moving); this.moving.dispose();
    if (this.frame) { this.scene.remove(this.frame); this.frame.dispose(); }
    // Shared geometry/material belong to the manager, not to this streamed view.
  }
}
