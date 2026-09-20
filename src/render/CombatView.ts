import { BoxGeometry, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, Vector3 } from 'three';
import type { Scene } from 'three';
import type { PlayerState } from '../player/PlayerState';
import type { CombatPoint, CombatState } from '../combat/CombatState';
import { getMuzzle } from '../combat/CombatState';

export class CombatView {
  private readonly root = new Group();
  private readonly geometry = new BoxGeometry(1, 1, 1);
  private readonly metal = new MeshStandardMaterial({ color: 0x454e55, roughness: .5, metalness: .3 });
  private readonly grip = new MeshStandardMaterial({ color: 0x222b30, roughness: .9 });
  private readonly flashMaterial = new MeshBasicMaterial({ color: 0xffdc87 });
  private readonly flash = new Mesh(this.geometry, this.flashMaterial);
  private readonly direction = new Vector3();
  private readonly forward = new Vector3(0, 0, -1);
  public constructor(private readonly scene: Scene) {
    const slide = new Mesh(this.geometry, this.metal); slide.scale.set(.12, .12, .33); slide.position.z = .165;
    const handle = new Mesh(this.geometry, this.grip); handle.scale.set(.10, .19, .12); handle.position.set(0, -.12, .25);
    slide.castShadow = true; handle.castShadow = true;
    this.flash.scale.set(.12, .12, .18); this.flash.position.z = -.06;
    this.root.add(slide, handle, this.flash); this.root.visible = false; scene.add(this.root);
  }
  public update(player: PlayerState, state: CombatState, aim: CombatPoint, flashRemaining: number): void {
    this.root.visible = state.equipped;
    if (!state.equipped) return;
    const direction = state.aiming ? aim : { x: -Math.sin(player.facingYaw), y: 0, z: -Math.cos(player.facingYaw) };
    const muzzle = getMuzzle(player.position, direction);
    this.root.position.set(muzzle.x, muzzle.y, muzzle.z);
    this.direction.set(direction.x, direction.y, direction.z).normalize(); this.root.quaternion.setFromUnitVectors(this.forward, this.direction);
    this.flash.visible = flashRemaining > 0;
  }
  public dispose(): void { this.scene.remove(this.root); this.geometry.dispose(); this.metal.dispose(); this.grip.dispose(); this.flashMaterial.dispose(); }
}
