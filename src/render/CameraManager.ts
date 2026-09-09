import { PerspectiveCamera } from 'three';
import type { GameConfig } from '../core/Config';
import type { InputManager } from '../input/InputManager';
import type { PhysicsWorld } from '../physics/PhysicsWorld';
import type { CameraRelativeBasis } from '../player/PlayerMovement';
import type { PlayerState } from '../player/PlayerState';
import type { WorldPosition } from '../world/ChunkCoord';
import {
  clampCameraPitch,
  getCameraRelativeBasis,
  getThirdPersonDesiredPosition,
  getThirdPersonTarget
} from './ThirdPersonCameraMath';

export type CameraMode = 'thirdPerson' | 'development';

const developmentMoveSpeed = 42;
const developmentSprintMultiplier = 2.5;
const developmentLookSensitivity = 0.007;

export class CameraManager {
  public readonly camera = new PerspectiveCamera(60, 1, 0.1, 1_500);
  private mode: CameraMode = 'thirdPerson';
  private thirdPersonYaw = 0;
  private thirdPersonPitch = 0.2;
  private developmentYaw = -2.52;
  private developmentPitch = -0.36;
  private playerState: PlayerState | undefined;

  public constructor(private readonly config: GameConfig['camera']) {
    window.addEventListener('resize', this.resize);
    this.resize();
  }

  public initialize(player: PlayerState): void {
    this.playerState = player;
    const desired = getThirdPersonDesiredPosition(player.position, this.thirdPersonYaw, this.thirdPersonPitch, this.config);
    this.camera.position.set(desired.x, desired.y, desired.z);
    this.lookAtThirdPersonTarget(player);
  }

  public update(
    input: InputManager,
    deltaSeconds: number,
    player: PlayerState,
    physics: PhysicsWorld,
    playerBody: ReturnType<PhysicsWorld['createKinematicCharacter']>['body'] | undefined
  ): void {
    this.playerState = player;
    if (this.mode === 'development') {
      this.updateDevelopmentCamera(input, deltaSeconds);
      return;
    }

    const pointerDelta = input.getPointerDelta();
    this.thirdPersonYaw -= pointerDelta.x * this.config.mouseSensitivity;
    this.thirdPersonPitch = clampCameraPitch(
      this.thirdPersonPitch - pointerDelta.y * this.config.mouseSensitivity,
      this.config.minPitch,
      this.config.maxPitch
    );
    this.updateThirdPersonCamera(deltaSeconds, player, physics, playerBody);
  }

  public toggleMode(): CameraMode {
    this.mode = this.mode === 'thirdPerson' ? 'development' : 'thirdPerson';
    return this.mode;
  }

  public get isThirdPerson(): boolean {
    return this.mode === 'thirdPerson';
  }

  public get modeLabel(): string {
    return this.mode === 'thirdPerson' ? 'Third Person' : 'Development';
  }

  public getMovementBasis(): CameraRelativeBasis {
    return getCameraRelativeBasis(this.thirdPersonYaw);
  }

  public getWorldPosition(): WorldPosition {
    if (this.mode === 'thirdPerson' && this.playerState !== undefined) return this.playerState.position;
    return this.camera.position;
  }

  public dispose(): void {
    window.removeEventListener('resize', this.resize);
  }

  private updateThirdPersonCamera(
    deltaSeconds: number,
    player: PlayerState,
    physics: PhysicsWorld,
    playerBody: ReturnType<PhysicsWorld['createKinematicCharacter']>['body'] | undefined
  ): void {
    const target = getThirdPersonTarget(player.position, this.config.targetHeight);
    const desired = getThirdPersonDesiredPosition(player.position, this.thirdPersonYaw, this.thirdPersonPitch, this.config);
    const directionX = desired.x - target.x;
    const directionY = desired.y - target.y;
    const directionZ = desired.z - target.z;
    const desiredDistance = Math.hypot(directionX, directionY, directionZ);
    const hitDistance = physics.castRay(
      [target.x, target.y, target.z],
      [directionX / desiredDistance, directionY / desiredDistance, directionZ / desiredDistance],
      desiredDistance,
      playerBody
    );
    const cameraDistance = hitDistance === undefined
      ? desiredDistance
      : Math.max(this.config.collisionPadding, hitDistance - this.config.collisionPadding);
    const collisionSafe = {
      x: target.x + (directionX / desiredDistance) * cameraDistance,
      y: target.y + (directionY / desiredDistance) * cameraDistance,
      z: target.z + (directionZ / desiredDistance) * cameraDistance
    };
    const alpha = 1 - Math.exp(-this.config.smoothing * deltaSeconds);
    this.camera.position.x += (collisionSafe.x - this.camera.position.x) * alpha;
    this.camera.position.y += (collisionSafe.y - this.camera.position.y) * alpha;
    this.camera.position.z += (collisionSafe.z - this.camera.position.z) * alpha;
    this.camera.lookAt(target.x, target.y, target.z);
  }

  private updateDevelopmentCamera(input: InputManager, deltaSeconds: number): void {
    const pointerDelta = input.getPointerDelta();
    this.developmentYaw -= pointerDelta.x * developmentLookSensitivity;
    this.developmentPitch = clampCameraPitch(this.developmentPitch - pointerDelta.y * developmentLookSensitivity, -1.35, 1.35);

    const forwardInput = Number(input.isActive('moveForward')) - Number(input.isActive('moveBackward'));
    const rightInput = Number(input.isActive('moveRight')) - Number(input.isActive('moveLeft'));
    if (forwardInput !== 0 || rightInput !== 0) {
      const magnitude = Math.hypot(forwardInput, rightInput);
      const speed = developmentMoveSpeed * (input.isActive('sprint') ? developmentSprintMultiplier : 1);
      const distance = (speed * deltaSeconds) / magnitude;
      const basis = getCameraRelativeBasis(this.developmentYaw);
      this.camera.position.x += (basis.forward.x * forwardInput + basis.right.x * rightInput) * distance;
      this.camera.position.z += (basis.forward.z * forwardInput + basis.right.z * rightInput) * distance;
    }

    const horizontalMagnitude = Math.cos(this.developmentPitch);
    this.camera.lookAt(
      this.camera.position.x + Math.sin(this.developmentYaw) * horizontalMagnitude,
      this.camera.position.y + Math.sin(this.developmentPitch),
      this.camera.position.z - Math.cos(this.developmentYaw) * horizontalMagnitude
    );
  }

  private lookAtThirdPersonTarget(player: PlayerState): void {
    const target = getThirdPersonTarget(player.position, this.config.targetHeight);
    this.camera.lookAt(target.x, target.y, target.z);
  }

  private readonly resize = (): void => {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
  };
}
