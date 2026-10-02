import { Group } from 'three';
import type { Scene, Vector3 } from 'three';
import type { PlayerState } from '../player/PlayerState';
import { CharacterResources, CharacterRig } from './CharacterRig';
import { visualTheme } from './VisualTheme';
import { defaultGameConfig } from '../core/Config';

export class PlayerView {
  private readonly root = new Group();
  private readonly resources = new CharacterResources();
  private yawInitialized = false;
  private readonly rig = new CharacterRig(this.resources, {
    shirt: visualTheme.character.shirt, skin: visualTheme.character.skin,
    pants: visualTheme.character.trousers, hair: 0x30251f, hairStyle: 1, clothingStyle: 1
  });
  public constructor(scene: Scene, private readonly capsuleExtent = 1) {
    // Preserve PlayerView's -Z forward contract; adapt the +Z-authored asset once.
    this.rig.root.rotation.y = Math.PI; this.root.add(this.rig.root); scene.add(this.root);
  }
  public update(state: PlayerState, armed = false, dt = 0, grip?: Vector3): void {
    const root = this.root;
    root.position.set(state.position.x, state.position.y - this.capsuleExtent, state.position.z);
    const target = -state.facingYaw;
    const difference = Math.atan2(Math.sin(target - root.rotation.y), Math.cos(target - root.rotation.y));
    root.rotation.y = !this.yawInitialized || dt === 0 ? target : root.rotation.y + difference * (1 - Math.exp(-18 * dt));
    this.yawInitialized = true;
    const speed = Math.hypot(state.velocity.x, state.velocity.z);
    const { walkSpeed, sprintSpeed } = defaultGameConfig.player;
    const sprint = Math.max(0, Math.min(1, (speed - walkSpeed) / (sprintSpeed - walkSpeed)));
    this.rig.walk(speed, dt, state.grounded, sprint);
    if (armed && grip) this.rig.holdPistol(grip);
  }
  public vehiclePose(amount: number, reach = amount): void { this.rig.vehiclePose(amount, reach); }
  public setVisible(visible: boolean): void { this.root.visible = visible; }
  public dispose(scene: Scene): void { scene.remove(this.root); this.resources.dispose(); }
}
