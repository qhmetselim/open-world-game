import { MathUtils, PerspectiveCamera } from 'three';
import type { InputManager } from '../input/InputManager';

export class CameraManager {
  public readonly camera = new PerspectiveCamera(60, 1, 0.1, 1_500);
  private yaw = Math.PI * 0.2;
  private pitch = -0.32;
  private distance = 38;

  public constructor() {
    this.camera.position.set(20, 16, 28);
    this.camera.lookAt(0, 3, 0);
    window.addEventListener('resize', this.resize);
    this.resize();
  }

  public update(input: InputManager): void {
    if (input.isPointerButtonDown(2)) {
      const pointerDelta = input.getPointerDelta();
      this.yaw -= pointerDelta.x * 0.007;
      this.pitch = MathUtils.clamp(this.pitch - pointerDelta.y * 0.007, -1.25, 0.15);
    } else {
      input.getPointerDelta();
    }

    const horizontalDistance = Math.cos(this.pitch) * this.distance;
    this.camera.position.set(
      Math.sin(this.yaw) * horizontalDistance,
      Math.sin(this.pitch) * this.distance + 12,
      Math.cos(this.yaw) * horizontalDistance
    );
    this.camera.lookAt(0, 2, 0);
  }

  public dispose(): void {
    window.removeEventListener('resize', this.resize);
  }

  private readonly resize = (): void => {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
  };
}
