import type { GameConfig } from '../core/Config';
import type { InputManager } from '../input/InputManager';
import type { KinematicCharacter, PhysicsWorld } from '../physics/PhysicsWorld';
import type { StreamingFocus } from '../world/ChunkStreaming';
import type { WorldPosition } from '../world/ChunkCoord';
import {
  approachAngle,
  calculateFacingYaw,
  calculateHorizontalVelocity,
  getCapsuleCenterHeight,
  resolveVerticalVelocity,
  shouldRecoverPlayer
} from './PlayerMovement';
import type { CameraRelativeBasis } from './PlayerMovement';
import { createPlayerState, serializePlayerState } from './PlayerState';
import type { PlayerState, SerializedPlayerState } from './PlayerState';

export type TerrainHeightQuery = (worldX: number, worldZ: number) => number;

export class PlayerController implements StreamingFocus {
  private readonly state: PlayerState;
  private character: KinematicCharacter | undefined;

  public constructor(private readonly config: GameConfig['player'], private readonly physics: PhysicsWorld) {
    this.state = createPlayerState({ x: config.spawnPosition.x, y: 0, z: config.spawnPosition.z });
  }

  public initialize(getTerrainHeight: TerrainHeightQuery): void {
    this.resetToSpawn(getTerrainHeight);
    this.character = this.physics.createKinematicCharacter(
      [this.state.position.x, this.state.position.y, this.state.position.z],
      this.config.capsuleHalfHeight,
      this.config.capsuleRadius,
      this.config.controllerOffset,
      this.config.maxSlopeAngleRadians
    );
  }

  public fixedUpdate(
    input: InputManager,
    basis: CameraRelativeBasis,
    deltaSeconds: number,
    movementEnabled: boolean,
    getTerrainHeight: TerrainHeightQuery
  ): void {
    const character = this.requireCharacter();
    if (shouldRecoverPlayer(this.state.position.y, this.config.killY)) {
      this.resetToSpawn(getTerrainHeight);
      this.physics.setKinematicCharacterPosition(character, [this.state.position.x, this.state.position.y, this.state.position.z]);
      return;
    }

    const velocity = calculateHorizontalVelocity({
      forward: movementEnabled && input.isActive('moveForward'),
      backward: movementEnabled && input.isActive('moveBackward'),
      left: movementEnabled && input.isActive('moveLeft'),
      right: movementEnabled && input.isActive('moveRight'),
      sprint: movementEnabled && input.isActive('sprint')
    }, basis, this.config.walkSpeed, this.config.sprintSpeed);
    const jumpRequested = input.consumePressed('jump') && movementEnabled;
    const verticalVelocity = resolveVerticalVelocity(
      this.state.velocity.y,
      this.state.grounded,
      jumpRequested,
      deltaSeconds,
      this.config
    );
    const desiredVerticalTranslation = this.state.grounded && verticalVelocity === 0 ? -this.config.controllerOffset : verticalVelocity * deltaSeconds;
    const movement = this.physics.computeCharacterMovement(character, [
      velocity.x * deltaSeconds,
      desiredVerticalTranslation,
      velocity.z * deltaSeconds
    ]);

    this.state.position.x += movement.translation[0];
    this.state.position.y += movement.translation[1];
    this.state.position.z += movement.translation[2];
    this.state.velocity.x = movement.translation[0] / deltaSeconds;
    this.state.velocity.z = movement.translation[2] / deltaSeconds;
    this.state.velocity.y = movement.grounded && verticalVelocity < 0 ? 0 : verticalVelocity;
    this.state.grounded = movement.grounded;

    const targetFacing = calculateFacingYaw(velocity);
    if (targetFacing !== undefined) {
      this.state.facingYaw = approachAngle(this.state.facingYaw, targetFacing, this.config.rotationSpeed * deltaSeconds);
    }

    this.physics.setKinematicCharacterPosition(character, [this.state.position.x, this.state.position.y, this.state.position.z]);
  }

  public getState(): PlayerState {
    return this.state;
  }

  public serialize(): SerializedPlayerState {
    return serializePlayerState(this.state);
  }

  public getWorldPosition(): WorldPosition {
    return this.state.position;
  }

  public getPhysicsBody(): KinematicCharacter['body'] | undefined {
    return this.character?.body;
  }

  public dispose(): void {
    if (this.character !== undefined) this.physics.removeKinematicCharacter(this.character);
    this.character = undefined;
  }

  private resetToSpawn(getTerrainHeight: TerrainHeightQuery): void {
    this.state.position.x = this.config.spawnPosition.x;
    this.state.position.z = this.config.spawnPosition.z;
    this.state.position.y = getCapsuleCenterHeight(getTerrainHeight(this.state.position.x, this.state.position.z), this.config);
    this.state.velocity.x = 0;
    this.state.velocity.y = 0;
    this.state.velocity.z = 0;
    this.state.grounded = false;
  }

  private requireCharacter(): KinematicCharacter {
    if (this.character === undefined) throw new Error('Player physics has not been initialized.');
    return this.character;
  }
}
