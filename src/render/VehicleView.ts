import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CylinderGeometry,
  Group,
  Line,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshStandardMaterial,
  Vector3,
  WireframeGeometry
} from 'three';
import type { Scene } from 'three';
import type { GameConfig } from '../core/Config';
import type { VehicleState } from '../vehicle/VehicleState';
import { getFrontWheelVisualSteering } from '../vehicle/VehicleMovement';

export class VehicleView {
  public readonly group = new Group();
  private readonly wheelPivots: Group[] = [];
  private readonly wheelMeshes: Mesh[] = [];
  private readonly chassisGeometry: BoxGeometry;
  private readonly cabinGeometry: BoxGeometry;
  private readonly wheelGeometry: CylinderGeometry;
  private readonly chassisMaterial = new MeshStandardMaterial({ color: 0x445f78, roughness: 0.75 });
  private readonly cabinMaterial = new MeshStandardMaterial({ color: 0x9eb5c0, roughness: 0.55 });
  private readonly wheelMaterial = new MeshStandardMaterial({ color: 0x17191b, roughness: 0.95 });
  private readonly debugGroup = new Group();
  private readonly debugRayGeometry = new BufferGeometry();
  private readonly debugMaterial = new LineBasicMaterial({ color: 0x55eaff });

  public constructor(private readonly scene: Scene, private readonly config: GameConfig['vehicle']['sedan']) {
    this.chassisGeometry = new BoxGeometry(config.chassisWidth, config.chassisHeight, config.chassisLength);
    this.cabinGeometry = new BoxGeometry(config.chassisWidth * 0.78, config.chassisHeight * 0.88, config.chassisLength * 0.5);
    this.wheelGeometry = new CylinderGeometry(config.wheelRadius, config.wheelRadius, 0.18, 12);
    const chassis = new Mesh(this.chassisGeometry, this.chassisMaterial);
    chassis.position.y = 0;
    this.group.add(chassis);
    const cabin = new Mesh(this.cabinGeometry, this.cabinMaterial);
    cabin.position.set(0, config.chassisHeight * 1.12, config.chassisLength * 0.08);
    this.group.add(cabin);

    const halfTrack = config.trackWidth / 2;
    const halfBase = config.wheelBase / 2;
    for (const [x, z] of [[-halfTrack, halfBase], [halfTrack, halfBase], [-halfTrack, -halfBase], [halfTrack, -halfBase]] as const) {
      const pivot = new Group();
      pivot.position.set(x, -config.chassisHeight / 2 - config.suspensionRestLength, z);
      const wheel = new Mesh(this.wheelGeometry, this.wheelMaterial);
      wheel.rotation.z = Math.PI / 2;
      pivot.add(wheel);
      this.group.add(pivot);
      this.wheelPivots.push(pivot);
      this.wheelMeshes.push(wheel);
    }

    const chassisBounds = new LineSegments(new WireframeGeometry(this.chassisGeometry), this.debugMaterial);
    chassisBounds.position.y = 0;
    this.debugRayGeometry.setAttribute('position', new BufferAttribute(new Float32Array(24), 3));
    const rays = new LineSegments(this.debugRayGeometry, this.debugMaterial);
    const forward = new Line(new BufferGeometry().setFromPoints([new Vector3(), new Vector3(0, 0, 3)]), new LineBasicMaterial({ color: 0xffca4b }));
    this.debugGroup.add(chassisBounds, rays, forward);
    this.debugGroup.visible = false;
    this.group.add(this.debugGroup);
    scene.add(this.group);
  }

  public update(state: VehicleState): void {
    this.group.position.set(state.position.x, state.position.y, state.position.z);
    this.group.quaternion.set(state.rotation.x, state.rotation.y, state.rotation.z, state.rotation.w);
    for (let index = 0; index < this.wheelPivots.length; index += 1) {
      const pivot = this.wheelPivots[index];
      const wheel = this.wheelMeshes[index];
      if (pivot === undefined || wheel === undefined) continue;
      pivot.rotation.y = index < 2 ? getFrontWheelVisualSteering(state.steering) : 0;
      pivot.position.y = -this.config.chassisHeight / 2 - (state.suspensionLengths?.[index] ?? this.config.suspensionRestLength);
      wheel.rotation.x = state.wheelRotations[index] ?? 0;
    }
    if (this.debugGroup.visible) this.updateDebugRays(state);
  }

  public setDebugVisible(visible: boolean): void {
    this.debugGroup.visible = visible;
  }

  public dispose(): void {
    this.scene.remove(this.group);
    this.chassisGeometry.dispose();
    this.cabinGeometry.dispose();
    this.wheelGeometry.dispose();
    this.chassisMaterial.dispose();
    this.cabinMaterial.dispose();
    this.wheelMaterial.dispose();
    this.debugRayGeometry.dispose();
    this.debugMaterial.dispose();
    const forward = this.debugGroup.children[2] as Line;
    forward.geometry.dispose();
    (forward.material as LineBasicMaterial).dispose();
    const chassisBounds = this.debugGroup.children[0] as LineSegments;
    chassisBounds.geometry.dispose();
  }

  private updateDebugRays(state: VehicleState): void {
    const attribute = this.debugRayGeometry.getAttribute('position');
    for (let index = 0; index < this.wheelPivots.length; index += 1) {
      const pivot = this.wheelPivots[index];
      if (pivot === undefined) continue;
      const offset = index * 2;
      attribute.setXYZ(offset, pivot.position.x, pivot.position.y, pivot.position.z);
      attribute.setXYZ(offset + 1, pivot.position.x, state.wheelContactCount > index ? -0.45 : -1.15, pivot.position.z);
    }
    attribute.needsUpdate = true;
    this.debugRayGeometry.computeBoundingSphere();
  }
}
