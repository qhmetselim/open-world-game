import { ArrowHelper, BoxGeometry, Group, Mesh, MeshStandardMaterial, SphereGeometry, Vector3 } from 'three';
import type { Material, Scene } from 'three';
import type { NpcIdentity, NpcState } from '../npc/NpcTypes';

export class NpcRenderResources {
  public readonly torso = new BoxGeometry(0.42, 0.72, 0.24);
  public readonly limb = new BoxGeometry(0.13, 0.58, 0.13);
  public readonly head = new SphereGeometry(0.23, 8, 6);
  public readonly hair = new BoxGeometry(0.3, 0.12, 0.27);
  private readonly materialCache = new Map<number, MeshStandardMaterial>();
  public material(color: number): MeshStandardMaterial { const existing = this.materialCache.get(color); if (existing !== undefined) return existing; const material = new MeshStandardMaterial({ color, roughness: 0.78 }); this.materialCache.set(color, material); return material; }
  public dispose(): void { this.torso.dispose(); this.limb.dispose(); this.head.dispose(); this.hair.dispose(); this.materialCache.forEach((material) => material.dispose()); this.materialCache.clear(); }
}

export class NpcView {
  private readonly root = new Group();
  private readonly leftArm = new Group();
  private readonly rightArm = new Group();
  private readonly leftLeg = new Group();
  private readonly rightLeg = new Group();
  private readonly debugArrow = new ArrowHelper(new Vector3(0, 0, 1), new Vector3(0, 1.05, 0), 0.7, 0xffd966);
  private phase = 0;
  private readonly feetOffset: number;
  public constructor(private readonly scene: Scene, resources: NpcRenderResources, identity: NpcIdentity, state: NpcState) {
    const appearance = state.appearance;
    this.root.scale.set(appearance.widthScale, appearance.heightScale, appearance.widthScale);
    this.feetOffset = getNpcFeetOffset(appearance.heightScale);
    this.add(resources.torso, resources.material(appearance.shirtColor), 0, 0.15, 0);
    this.add(resources.head, resources.material(appearance.skinColor), 0, 0.72, 0);
    this.add(resources.hair, resources.material(appearance.hairColor), 0, appearance.hairStyle === 0 ? 0.91 : 0.87, appearance.hairStyle === 2 ? -0.08 : 0);
    this.addLimb(this.leftArm, resources, appearance.shirtColor, -0.3, 0.22);
    this.addLimb(this.rightArm, resources, appearance.shirtColor, 0.3, 0.22);
    this.addLimb(this.leftLeg, resources, appearance.pantsColor, -0.12, -0.48);
    this.addLimb(this.rightLeg, resources, appearance.pantsColor, 0.12, -0.48);
    this.root.name = identity.id;
    this.debugArrow.visible = false;
    this.root.add(this.debugArrow);
    scene.add(this.root);
  }
  public update(state: NpcState, deltaSeconds: number): void {
    this.root.position.set(state.position.x, state.position.y + this.feetOffset, state.position.z);
    this.root.rotation.y = state.facingYaw;
    const walking = state.activity === 'walking';
    this.phase += walking ? deltaSeconds * 8 : deltaSeconds * 3;
    const swing = walking ? Math.sin(this.phase) * 0.55 : 0;
    this.leftArm.rotation.x = swing; this.rightArm.rotation.x = -swing; this.leftLeg.rotation.x = -swing; this.rightLeg.rotation.x = swing;
    this.root.position.y = state.position.y + this.feetOffset + (walking ? Math.abs(Math.sin(this.phase)) * 0.035 : 0);
    this.debugArrow.setDirection(new Vector3(Math.sin(state.facingYaw), 0, Math.cos(state.facingYaw)));
  }
  public setDebugVisible(visible: boolean): void { this.debugArrow.visible = visible; }
  public dispose(): void {
    this.scene.remove(this.root);
    this.debugArrow.line.geometry.dispose();
    this.debugArrow.cone.geometry.dispose();
    disposeMaterial(this.debugArrow.line.material);
    disposeMaterial(this.debugArrow.cone.material);
  }
  private add(geometry: BoxGeometry | SphereGeometry, material: MeshStandardMaterial, x: number, y: number, z: number): void { const mesh = new Mesh(geometry, material); mesh.castShadow = true; mesh.position.set(x, y, z); this.root.add(mesh); }
  private addLimb(group: Group, resources: NpcRenderResources, color: number, x: number, y: number): void { const mesh = new Mesh(resources.limb, resources.material(color)); mesh.position.y = -0.29; mesh.castShadow = true; group.position.set(x, y, 0); group.add(mesh); this.root.add(group); }
}

/** The procedural limb layout extends 1.06 local units below its root. */
export function getNpcFeetOffset(heightScale: number): number {
  return 1.06 * heightScale;
}

function disposeMaterial(material: Material | Material[]): void { (Array.isArray(material) ? material : [material]).forEach((item) => item.dispose()); }
