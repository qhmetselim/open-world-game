import { MathUtils, PerspectiveCamera } from 'three';
import type { InputManager } from '../input/InputManager';
import type { WorldPosition } from '../world/ChunkCoord';

const cameraLookSensitivity = 0.007;
const cameraMoveSpeed = 42;
const cameraSprintMultiplier = 2.5;

export class CameraManager {
  public readonly camera = new PerspectiveCamera(60, 1, 0.1, 1_500);
  private yaw = -2.52;
  private pitch = -0.36;

  public constructor() {
    this.camera.position.set(0.1, 16, 0.1);
    this.updateCameraOrientation();
    window.addEventListener('resize', this.resize);
    this.resize();
  }

  public update(input: InputManager, deltaSeconds: number): void {
    if (input.isPointerButtonDown(2)) {
      const pointerDelta = input.getPointerDelta();
      this.yaw -= pointerDelta.x * cameraLookSensitivity;
      this.pitch = MathUtils.clamp(this.pitch - pointerDelta.y * cameraLookSensitivity, -1.35, 1.35);
    } else {
      input.getPointerDelta();
    }

    const forwardInput = Number(input.isActive('moveForward')) - Number(input.isActive('moveBackward'));
    const rightInput = Number(input.isActive('moveRight')) - Number(input.isActive('moveLeft'));
    if (forwardInput !== 0 || rightInput !== 0) {
      const length = Math.hypot(forwardInput, rightInput);
      const speed = cameraMoveSpeed * (input.isActive('sprint') ? cameraSprintMultiplier : 1);
      const distance = (speed * deltaSeconds) / length;
      const forwardX = Math.sin(this.yaw);
      const forwardZ = Math.cos(this.yaw);
      this.camera.position.x += (forwardX * forwardInput + forwardZ * rightInput) * distance;
      this.camera.position.z += (forwardZ * forwardInput - forwardX * rightInput) * distance;
    }

    this.updateCameraOrientation();
  }

  public getWorldPosition(): WorldPosition {
    return { x: this.camera.position.x, z: this.camera.position.z };
  }

  public dispose(): void {
    window.removeEventListener('resize', this.resize);
  }

  private updateCameraOrientation(): void {
    const horizontalMagnitude = Math.cos(this.pitch);
    this.camera.lookAt(
      this.camera.position.x + Math.sin(this.yaw) * horizontalMagnitude,
      this.camera.position.y + Math.sin(this.pitch),
      this.camera.position.z + Math.cos(this.yaw) * horizontalMagnitude
    );
  }

  private readonly resize = (): void => {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
  };
}
