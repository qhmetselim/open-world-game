import { ArrowHelper, Group, Mesh, MeshStandardMaterial, Vector3 } from 'three';
import type { Material, Scene } from 'three';
import type { NpcIdentity, NpcState } from '../npc/NpcTypes';
import { CharacterResources, CharacterRig } from './CharacterRig';
import { registerEntityLod, visualLod } from './VisualLod';

export class NpcRenderResources extends CharacterResources {}

export class NpcView {
  private readonly root = new Group();
  private readonly rig: CharacterRig;
  private readonly debugArrow = new ArrowHelper(new Vector3(0, 0, 1), new Vector3(0, 1.05, 0), 0.7, 0xffd966);
  private deathProgress = 0;
  private readonly fadeMaterials = new Map<MeshStandardMaterial, MeshStandardMaterial>();
  private fading = false;
  private readonly feetOffset: number;
  private readonly unregisterLod: () => void;
  public constructor(private readonly scene: Scene, resources: NpcRenderResources, identity: NpcIdentity, state: NpcState, police = false) {
    const appearance = state.appearance;
    this.root.scale.set(appearance.widthScale, appearance.heightScale, appearance.widthScale);
    this.feetOffset = getNpcFeetOffset(appearance.heightScale);
    this.rig = new CharacterRig(resources, { shirt: appearance.shirtColor, pants: appearance.pantsColor,
      skin: appearance.skinColor, hair: appearance.hairColor, hairStyle: appearance.hairStyle,
      clothingStyle: identity.clothingSeed % 3, police });
    // Preserve the centred corpse pivot; the GLB character itself has a feet origin.
    this.rig.root.position.y = -1.06; this.root.add(this.rig.root);
    this.root.name = identity.id;
    this.root.traverse((object) => { if (object instanceof Mesh) object.receiveShadow = true; });
    // ArrowHelper primitives are globally shared by Three.js; own copies for this view's disposal.
    this.debugArrow.line.geometry = this.debugArrow.line.geometry.clone();
    this.debugArrow.cone.geometry = this.debugArrow.cone.geometry.clone();
    this.debugArrow.visible = false;
    this.root.add(this.debugArrow);
    scene.add(this.root);
    this.unregisterLod = registerEntityLod(scene, this.root, visualLod.character);
  }
  public update(state: NpcState, deltaSeconds: number, pistolGrip?: Vector3): void {
    if (state.activity === 'dead') {
      if(state.corpseOpacity!==undefined&&state.corpseOpacity<1) {
        // Clone only fading corpse materials: never dim shared living NPC/police materials.
        if(!this.fading)this.root.traverse(object=>{
          if(!(object instanceof Mesh)||!(object.material instanceof MeshStandardMaterial))return;
            const material=object.material;
            let clone=this.fadeMaterials.get(material);
            if(!clone){clone=material.clone();clone.transparent=true;clone.depthWrite=false;this.fadeMaterials.set(material,clone);}
            object.material=clone;
          object.castShadow=false;
        });
        this.fading=true;
        this.fadeMaterials.forEach(material=>{material.opacity=state.corpseOpacity!;});
      }
      this.deathProgress = Math.min(1, this.deathProgress + deltaSeconds / .55);
      const fall = this.deathProgress * this.deathProgress * (3 - 2 * this.deathProgress);
      this.root.position.set(state.position.x, state.position.y + this.feetOffset * (1 - fall) + .25 * state.appearance.widthScale * fall, state.position.z);
      this.root.rotation.set(Math.PI / 2 * fall, state.facingYaw, 0);
      this.rig.walk(0, deltaSeconds);
      this.rig.vehiclePose(.3 * (1 - fall));
      this.debugArrow.visible = false;
      return;
    }
    this.root.position.set(state.position.x, state.position.y + this.feetOffset, state.position.z);
    const delta = Math.atan2(Math.sin(state.facingYaw - this.root.rotation.y), Math.cos(state.facingYaw - this.root.rotation.y));
    this.root.rotation.y += delta * (1 - Math.exp(-14 * deltaSeconds));
    const speed = state.actualSpeed ?? 0;
    this.rig.walk(speed, deltaSeconds);
    if (pistolGrip) this.rig.holdPistol(pistolGrip);
    // Local +Z already inherits the root's facing yaw.
  }
  public setDebugVisible(visible: boolean): void { this.debugArrow.visible = visible; }
  public dispose(): void {
    this.unregisterLod();
    this.scene.remove(this.root);
    this.fadeMaterials.forEach(material=>material.dispose());this.fadeMaterials.clear();
    this.debugArrow.line.geometry.dispose();
    this.debugArrow.cone.geometry.dispose();
    disposeMaterial(this.debugArrow.line.material);
    disposeMaterial(this.debugArrow.cone.material);
  }
}

/** Stable centred NPC/corpse pivot, retained independently of the feet-origin model. */
export function getNpcFeetOffset(heightScale: number): number {
  return 1.06 * heightScale;
}

function disposeMaterial(material: Material | Material[]): void { (Array.isArray(material) ? material : [material]).forEach((item) => item.dispose()); }
