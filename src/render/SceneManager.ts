import {
  Color,
  DirectionalLight,
  HemisphereLight,
  Mesh,
  Scene
} from 'three';

export class SceneManager {
  public readonly scene = new Scene();

  public constructor() {
    this.scene.background = new Color(0x8fc4e8);

    const hemisphereLight = new HemisphereLight(0xc7e6ff, 0x405038, 2.2);
    this.scene.add(hemisphereLight);

    const sunLight = new DirectionalLight(0xfff1d2, 3.2);
    sunLight.position.set(45, 65, 20);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.set(2048, 2048);
    sunLight.shadow.camera.left = -50;
    sunLight.shadow.camera.right = 50;
    sunLight.shadow.camera.top = 50;
    sunLight.shadow.camera.bottom = -50;
    this.scene.add(sunLight);
  }

  public dispose(): void {
    this.scene.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      object.geometry.dispose();
      if (Array.isArray(object.material)) {
        object.material.forEach((material) => material.dispose());
      } else {
        object.material.dispose();
      }
    });
    this.scene.clear();
  }
}
