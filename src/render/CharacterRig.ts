import { BufferAttribute, Color, Group, Matrix4, Mesh, MeshStandardMaterial, Quaternion, Vector3 } from 'three';
import type { BufferGeometry, Object3D } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { coreModels } from './loaders/CoreModels';
import { visualTheme } from './VisualTheme';

export interface CharacterLook {
  shirt: number; pants: number; skin: number; hair: number;
  hairStyle: number; clothingStyle: number; police?: boolean;
}

/** Shared rigid-part library, not one GLB/material per person. Cache keys contain only
 * colours actually used by a part; authored palettes and style counts bound this cache.
 * The asset cache owns source GLB data; this resource owns merged colour-baked parts. */
export class CharacterResources {
  private readonly parts = new Map<string, BufferGeometry>();
  public readonly material = new MeshStandardMaterial({ vertexColors: true, roughness: visualTheme.character.roughness });
  public constructor(private source?: Object3D) {}
  public part(name: string, look: CharacterLook): Mesh | undefined {
    this.source ??= coreModels.create('human');
    const node = this.source?.getObjectByName(name);
    if (!node) return undefined; // Headless simulation tests don't fetch visual assets.
    node.updateWorldMatrix(true, true);
    const palette: Record<string, number> = { MAT_Shirt: look.police ? 0x213e60 : look.shirt, MAT_Pants: look.pants, MAT_Skin: look.skin, MAT_Hair: look.hair };
    const meshes: Mesh<BufferGeometry, MeshStandardMaterial>[] = [];
    node.traverse(object => { if (object instanceof Mesh && object.material instanceof MeshStandardMaterial) meshes.push(object as Mesh<BufferGeometry, MeshStandardMaterial>); });
    const key = name + meshes.map(mesh => `:${mesh.material.name}:${palette[mesh.material.name] ?? 'authored'}`).join('');
    let geometry = this.parts.get(key);
    if (!geometry) {
      const inverse = new Matrix4().copy(node.matrixWorld).invert();
      const parts = meshes.map(mesh => {
        const part = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
        part.applyMatrix4(new Matrix4().multiplyMatrices(inverse, mesh.matrixWorld));
        for (const attribute of Object.keys(part.attributes)) if (attribute !== 'position' && attribute !== 'normal') part.deleteAttribute(attribute);
        const override = palette[mesh.material.name];
        const color = override === undefined ? mesh.material.color : new Color(override);
        const count = part.getAttribute('position').count, colors = new Float32Array(count * 3);
        for (let i = 0; i < count; i++) color.toArray(colors, i * 3);
        part.setAttribute('color', new BufferAttribute(colors, 3)); return part;
      });
      geometry = mergeGeometries(parts) ?? undefined; parts.forEach(part => part.dispose());
      if (!geometry) return undefined;
      geometry.computeBoundingBox(); geometry.computeBoundingSphere(); this.parts.set(key, geometry);
    }
    const mesh = new Mesh(geometry, this.material); mesh.castShadow = true; mesh.receiveShadow = true; return mesh;
  }
  public dispose(): void { this.parts.forEach(part => part.dispose()); this.parts.clear(); this.material.dispose(); this.source = undefined; }
}

/** Feet-origin, +Z forward; shoulder/hip/elbow nodes are future clip attachment points.
 * Rigid limbs retain the current lightweight walk/death animation, no physics skeleton. */
export class CharacterRig {
  public readonly root = new Group();
  public readonly leftArm = new Group();
  public readonly rightArm = new Group();
  public readonly leftLeg = new Group();
  public readonly rightLeg = new Group();
  public readonly leftKnee = new Group();
  public readonly rightKnee = new Group();
  public readonly leftFoot = new Group();
  public readonly rightFoot = new Group();
  private readonly leftForearm = new Group();
  private readonly rightForearm = new Group();
  private phase = 0;
  private clock = 0;
  private motion = 0;
  private run = 0;
  private readonly upperBody = new Group();
  private readonly target = new Vector3();
  private readonly down = new Vector3(0, -1, 0);
  private readonly direction = new Vector3();
  private readonly bend = new Vector3();
  private readonly elbow = new Vector3();
  private readonly wrist = new Vector3();
  private readonly inverseArm = new Quaternion();
  public constructor(resources: CharacterResources, look: CharacterLook) {
    const add = (name: string, parent: Group, x = 0, y = 0) => { const part = resources.part(name, look); if (part) { part.position.set(x, y, 0); parent.add(part); } };
    this.root.add(this.upperBody);
    add(`torso${look.police ? 3 : look.clothingStyle % 3}`, this.upperBody, 0, 1.50);
    add('head', this.upperBody, 0, 1.645);
    add(look.police ? 'cap' : `hair${look.hairStyle % 3}`, this.upperBody, 0, 1.645);
    for (const [arm, forearm, side] of [[this.leftArm, this.leftForearm, 1], [this.rightArm, this.rightForearm, -1]] as const) {
      arm.position.set(side * .27, 1.51, 0); this.root.add(arm); add('upperArm', arm);
      forearm.position.y = -.30; arm.add(forearm); add('forearm', forearm);
    }
    for (const [leg, knee, foot, side] of [[this.leftLeg, this.leftKnee, this.leftFoot, 1], [this.rightLeg, this.rightKnee, this.rightFoot, -1]] as const) {
      leg.position.set(side * .113, .94, 0); this.root.add(leg); add(`leg${look.clothingStyle % 2}`, leg);
      knee.position.y = -.46; leg.add(knee); add(`shin${look.clothingStyle % 2}`, knee);
      foot.position.y = -.34; knee.add(foot); add('foot', foot);
    }
  }
  public walk(speed: number, dt: number, grounded = true, runTarget = Math.max(0, Math.min(1, (speed - 2.8) / 3))): void {
    const step = Math.max(0, Math.min(dt, .1)), blend = 1 - Math.exp(-12 * step);
    this.clock += step;
    this.motion += ((grounded ? Math.min(1, speed / .9) : 0) - this.motion) * blend;
    this.run += (runTarget - this.run) * blend;
    // Distance-driven cadence: no marching in place when the controller is blocked.
    this.phase += step * speed * (5.8 - this.run * 1.6);
    const wave = Math.sin(this.phase), stride = (.39 + .36 * this.run) * this.motion;
    this.leftArm.rotation.set(wave * stride * .85 - this.run * .12, 0, -.04);
    this.rightArm.rotation.set(-wave * stride * .85 - this.run * .12, 0, .04);
    this.leftForearm.rotation.set(-.13 - this.run * .65, 0, 0);
    this.rightForearm.rotation.set(-.13 - this.run * .65, 0, 0);
    const hip = .94 - (.06 + .04 * this.run) * this.motion;
    for (const [leg,knee,foot,offset] of [[this.leftLeg,this.leftKnee,this.leftFoot,0],[this.rightLeg,this.rightKnee,this.rightFoot,Math.PI]] as const) {
      const cycle=((this.phase+offset)%(Math.PI*2))/(Math.PI*2);
      const swing=Math.max(0,(cycle-.5)*2), ease=swing*swing*(3-2*swing);
      const z=(cycle<.5?1-4*cycle:-1+2*ease)*(.27+.10*this.run)*this.motion;
      const lift=Math.sin(swing*Math.PI)*(.11+.10*this.run)*this.motion;
      const down=hip-.14-lift, a=.46, b=.34;
      const bend=Math.acos(Math.max(-1,Math.min(1,(down*down+z*z-a*a-b*b)/(2*a*b))));
      leg.position.y=hip; leg.rotation.set(Math.atan2(-z,down)-Math.atan2(b*Math.sin(bend),a+b*Math.cos(bend)),0,0);
      knee.rotation.x=bend; foot.rotation.x=-leg.rotation.x-bend;
    }
    this.upperBody.position.y = hip-.94+Math.sin(this.clock * 1.8) * .004 * (1 - this.motion);
    this.leftArm.position.y = this.rightArm.position.y = 1.51+hip-.94;
    this.upperBody.rotation.set(this.run * .035, wave * .025 * this.motion, wave * .012 * this.motion);
  }
  /** Visual-only reach/crouch for the door/seat transition. */
  public vehiclePose(amount: number, reach = amount): void {
    if (amount === 0 && reach === 0) return;
    const duck = .22 * reach + .30 * amount;
    this.upperBody.position.y -= duck;
    this.leftArm.position.y -= duck; this.rightArm.position.y -= duck;
    this.leftArm.rotation.x = -.65 * Math.max(amount, reach); this.rightArm.rotation.x = -.9 * Math.max(amount, reach);
    this.leftForearm.rotation.x = -.5 * Math.max(amount, reach); this.rightForearm.rotation.x = -.7 * Math.max(amount, reach);
    if (amount > 0 || reach > 0) {
      const crouch = reach * (1 - amount);
      this.leftLeg.position.y = this.rightLeg.position.y = .94 - .22 * crouch;
      this.leftLeg.rotation.x = this.rightLeg.rotation.x = -.8 * crouch - 1.15 * amount;
      this.leftKnee.rotation.x = this.rightKnee.rotation.x = 1.6 * crouch + 1.3 * amount;
      this.leftFoot.rotation.x = this.rightFoot.rotation.x = -.8 * crouch - .15 * amount;
    }
  }
  /** View-only two-bone reach. Target is the existing pistol grip in world space;
   * it never changes muzzle/hitscan math or player/controller orientation. */
  public holdPistol(grip: Vector3): void {
    this.root.updateWorldMatrix(true, true);
    this.target.copy(grip); this.root.worldToLocal(this.target);
    const arm = this.rightArm, forearm = this.rightForearm;
    const delta = this.direction.copy(this.target).sub(arm.position);
    const a = .30, b = .285, distance = Math.min(a + b - .001, Math.max(.08, delta.length()));
    const direction = delta.normalize();
    const bend = this.bend.set(0, -1, 0).addScaledVector(direction, direction.y).normalize();
    const along = (a * a + distance * distance - b * b) / (2 * distance);
    const elbow = this.elbow.copy(direction).multiplyScalar(along).addScaledVector(bend, Math.sqrt(Math.max(0, a * a - along * along)));
    arm.quaternion.setFromUnitVectors(this.down, this.wrist.copy(elbow).normalize());
    const wrist = this.wrist.copy(direction).multiplyScalar(distance).sub(elbow).applyQuaternion(this.inverseArm.copy(arm.quaternion).invert()).normalize();
    forearm.quaternion.setFromUnitVectors(this.down, wrist);
    // Existing right-shoulder muzzle offset suits a one-handed stance; don't stretch
    // the support arm across an unreachable target or modify the gameplay muzzle.
    this.leftArm.rotation.set(-.65, 0, -.65); this.leftForearm.rotation.x = -.8;
  }
}
