import { Mesh } from 'three';
import type { Scene } from 'three';
import { ModelCache } from './loaders/ModelCache';
import type { ModelInstance } from './loaders/ModelCache';
import { modelCatalog } from './loaders/ModelCatalog';

/** Single visual-only export proof near the protected development spawn area.
 * It does not replace procedural props or register any gameplay/physics state. */
export class DevelopmentModelView {
  private readonly models = new ModelCache();
  private instance: ModelInstance | undefined;
  public async initialize(scene: Scene, position: { x: number; y: number; z: number }): Promise<void> {
    try {
      this.instance = await this.models.acquire(modelCatalog.streetLampTest.url);
      const root = this.instance.root;
      root.name = 'development:blender-street-lamp';
      root.position.set(position.x, position.y, position.z);
      root.traverse((object) => { if (object instanceof Mesh) { object.castShadow = true; object.receiveShadow = true; } });
      scene.add(root);
      console.info('Blender GLB ready', modelCatalog.streetLampTest.id, position);
    } catch (error) {
      console.warn('Development GLB preview unavailable', error);
    }
  }
  public update(camera: { x: number; z: number }, loaded: (x: number, z: number) => boolean): void {
    const root = this.instance?.root;
    if (root) root.visible = loaded(root.position.x, root.position.z)
      && Math.hypot(camera.x - root.position.x, camera.z - root.position.z) < 100;
  }
  public dispose(): void { this.models.dispose(); this.instance = undefined; }
}
