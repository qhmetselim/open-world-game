import { BoxGeometry, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, Vector3 } from 'three';
import type { Scene } from 'three';
import type { PlayerState } from '../player/PlayerState';
import type { CombatPoint, CombatState } from '../combat/CombatState';
import { getMuzzle } from '../combat/CombatState';
import { combatConfig } from '../combat/CombatConfig';
import { coreModels } from './loaders/CoreModels';

export class CombatView {
  private readonly root = new Group();
  private readonly fallback = new Group();
  private readonly geometry = new BoxGeometry(1, 1, 1);
  private readonly metal = new MeshStandardMaterial({ color: 0x454e55, roughness: .5, metalness: .3 });
  private readonly grip = new MeshStandardMaterial({ color: 0x222b30, roughness: .9 });
  private readonly flashMaterial = new MeshBasicMaterial({ color: 0xffdc87 });
  private readonly flash = new Mesh(this.geometry, this.flashMaterial);
  private readonly direction = new Vector3();
  private readonly forward = new Vector3(0, 0, -1);
  private readonly gripPosition = new Vector3();
  private draw = 0;
  public get presenting(): boolean { return this.root.visible; }
  public constructor(private readonly scene: Scene) {
    const slide = new Mesh(this.geometry, this.metal); slide.scale.set(.12, .12, .33); slide.position.z = .165;
    const handle = new Mesh(this.geometry, this.grip); handle.scale.set(.10, .19, .12); handle.position.set(0, -.12, .25);
    slide.castShadow = true; handle.castShadow = true;
    this.flash.scale.set(.22, .22, .38); this.flash.position.z = -.14;
    this.fallback.add(slide, handle); this.root.add(this.fallback, this.flash); this.root.visible = false; scene.add(this.root);
  }
  public initializeModel(): void {
    const model = coreModels.create('pistol');
    if (model) { this.fallback.visible = false; this.root.add(model); }
  }
  public update(player: PlayerState, state: CombatState, aim: CombatPoint, flashRemaining: number, dt = 0): void {
    // The simulation remains immediate. Only the hand/weapon presentation blends.
    this.draw = dt === 0 ? Number(state.equipped) : Math.max(0, Math.min(1, this.draw + (state.equipped ? 1 : -1) * dt / .38));
    if (flashRemaining > 0) this.draw = 1; // Actual shots always originate at the actual muzzle.
    this.root.visible = this.draw > .03;
    if (!this.root.visible) return;
    const direction = state.aiming ? aim : { x: Math.sin(player.facingYaw), y: 0, z: -Math.cos(player.facingYaw) };
    const muzzle = getMuzzle(player.position, direction);
    this.root.position.set(muzzle.x, muzzle.y, muzzle.z);
    this.direction.set(direction.x, direction.y, direction.z).normalize(); this.root.quaternion.setFromUnitVectors(this.forward, this.direction);
    const ready = this.draw * this.draw * (3 - 2 * this.draw);
    const hip = new Vector3(player.position.x + Math.cos(player.facingYaw) * .30,
      player.position.y - .16, player.position.z + Math.sin(player.facingYaw) * .30);
    this.root.position.lerp(hip, 1 - ready); this.root.rotateX(-(1 - ready) * 1.1);
    const kick = flashRemaining/combatConfig.flashSeconds;
    this.root.position.addScaledVector(this.direction,-kick*.09); this.root.rotateX(kick*.09);
    this.flash.visible = flashRemaining > 0;
  }
  public dispose(): void { this.scene.remove(this.root); this.geometry.dispose(); this.metal.dispose(); this.grip.dispose(); this.flashMaterial.dispose(); }
  /** Visual attachment including recoil; never changes gameplay muzzle/hitscan math. */
  public getGripPosition(): Vector3 { this.root.updateMatrixWorld(true); return this.root.localToWorld(this.gripPosition.set(0, -.15, .255)); }
}
