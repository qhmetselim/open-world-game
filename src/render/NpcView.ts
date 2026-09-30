import { ArrowHelper, Group, Mesh, MeshStandardMaterial, Vector3 } from 'three';
import type { Material, Scene } from 'three';
import type { NpcIdentity, NpcState } from '../npc/NpcTypes';
import { CharacterResources, CharacterRig } from './CharacterRig';

export class NpcRenderResources extends CharacterResources {}

export class NpcView {
  private readonly root = new Group();
  private readonly rig: CharacterRig;
  private readonly debugArrow = new ArrowHelper(new Vector3(0, 0, 1), new Vector3(0, 1.05, 0), 0.7, 0xffd966);
  private phase = 0;
  private readonly fadeMaterials = new Map<MeshStandardMaterial, MeshStandardMaterial>();
  private fading = false;
  private readonly feetOffset: number;
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
      this.root.position.set(state.position.x, state.position.y + .25 * state.appearance.widthScale, state.position.z);
      this.root.rotation.set(Math.PI / 2, state.facingYaw, 0);
      this.rig.walk(0, 0);
      this.debugArrow.visible = false;
      return;
    }
    this.root.position.set(state.position.x, state.position.y + this.feetOffset, state.position.z);
    this.root.rotation.y = state.facingYaw;
    const speed = state.actualSpeed ?? 0;
    const walking = speed > .02;
    this.phase += deltaSeconds * speed * 5;
    this.rig.walk(speed, deltaSeconds);
    this.root.position.y = state.position.y + this.feetOffset + (walking ? Math.abs(Math.sin(this.phase)) * 0.035 : 0);
    if (pistolGrip) this.rig.holdPistol(pistolGrip);
    // Local +Z already inherits the root's facing yaw.
  }
  public setDebugVisible(visible: boolean): void { this.debugArrow.visible = visible; }
  public dispose(): void {
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
