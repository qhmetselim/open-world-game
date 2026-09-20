import { BoxGeometry, BufferAttribute, Group, LineSegments, LineBasicMaterial, Mesh, MeshStandardMaterial, Vector3 } from 'three';
import type { CylinderGeometry, Scene } from 'three';
import type { GameConfig } from '../core/Config';
import type { TrafficVehicleState } from '../traffic/TrafficTypes';
import { visualTheme } from './VisualTheme';
import { createSedanCabin, createSedanWheel } from './VehicleVisualGeometry';
import { getFrontWheelVisualSteering } from '../vehicle/VehicleMovement';

export class TrafficVehicleRenderResources {
  public readonly chassis: BoxGeometry;
  public readonly cabin: BoxGeometry;
  public readonly wheel: CylinderGeometry;
  private readonly colors = new Map<number, MeshStandardMaterial>();
  public readonly wheelMaterial = new MeshStandardMaterial({ vertexColors: true, roughness: 0.92 });
  public readonly glassMaterial = new MeshStandardMaterial({ color: visualTheme.vehicle.glass, roughness: visualTheme.vehicle.glassRoughness, metalness: visualTheme.vehicle.metalness });
  public constructor(config: GameConfig['vehicle']['sedan']) {
    this.chassis = new BoxGeometry(config.chassisWidth, config.chassisHeight, config.chassisLength);
    this.cabin = createSedanCabin(config.chassisWidth * .78, config.chassisHeight * .88, config.chassisLength * .5);
    this.wheel = createSedanWheel(config.wheelRadius, .18, 10);
  }
  public bodyMaterial(color: number): MeshStandardMaterial {
    const cached = this.colors.get(color);
    if (cached !== undefined) return cached;
    const material = new MeshStandardMaterial({ color, roughness: visualTheme.vehicle.bodyRoughness, metalness: visualTheme.vehicle.metalness });
    this.colors.set(color, material);
    return material;
  }
  public dispose(): void { this.chassis.dispose(); this.cabin.dispose(); this.wheel.dispose(); this.wheelMaterial.dispose(); this.glassMaterial.dispose(); this.colors.forEach((material) => material.dispose()); this.colors.clear(); }
}

export class TrafficVehicleView {
  private readonly group = new Group();
  private readonly wheelPivots: Group[] = [];
  private readonly wheels: Mesh[] = [];
  private readonly debugLine = new LineSegments(undefined, new LineBasicMaterial({ color: 0x54e8df, depthTest: false }));
  private readonly debugPoint = new Vector3();
  public constructor(scene: Scene, resources: TrafficVehicleRenderResources, private readonly config: GameConfig['vehicle']['sedan'], state: TrafficVehicleState) {
    const chassis = new Mesh(resources.chassis, resources.bodyMaterial(state.color)); chassis.castShadow = true; this.group.add(chassis);
    const cabin = new Mesh(resources.cabin, resources.glassMaterial); cabin.position.set(0, config.chassisHeight * 1.12, config.chassisLength * .08); cabin.castShadow = true; this.group.add(cabin);
    for (const [x, z] of [[-config.trackWidth / 2, config.wheelBase / 2], [config.trackWidth / 2, config.wheelBase / 2], [-config.trackWidth / 2, -config.wheelBase / 2], [config.trackWidth / 2, -config.wheelBase / 2]] as const) {
      const pivot = new Group(); pivot.position.set(x, -config.chassisHeight / 2 - config.suspensionRestLength, z);
      const wheel = new Mesh(resources.wheel, resources.wheelMaterial); wheel.rotation.z = Math.PI / 2; wheel.castShadow = true; pivot.add(wheel); this.group.add(pivot); this.wheelPivots.push(pivot); this.wheels.push(wheel);
    }
    this.group.traverse((object) => { if (object instanceof Mesh) object.receiveShadow = true; });
    this.debugLine.geometry.setAttribute('position', new BufferAttribute(new Float32Array(18), 3)); this.debugLine.frustumCulled = false;
    this.debugLine.visible = false; this.group.add(this.debugLine); scene.add(this.group);
  }
  public update(state: TrafficVehicleState): void {
    this.group.position.set(state.position.x, state.position.y, state.position.z); this.group.quaternion.set(state.rotation.x, state.rotation.y, state.rotation.z, state.rotation.w);
    for (let index = 0; index < this.wheelPivots.length; index += 1) {
      const pivot = this.wheelPivots[index]; const wheel = this.wheels[index]; if (pivot === undefined || wheel === undefined) continue;
      pivot.position.y = -this.config.chassisHeight / 2 - (state.suspensionLengths[index] ?? this.config.suspensionRestLength);
      pivot.rotation.y = index < 2 ? getFrontWheelVisualSteering(state.steering) : 0; wheel.rotation.x = state.wheelRotations[index] ?? 0;
    }
    if (this.debugLine.visible) {
      this.group.updateMatrixWorld(true);
      const points = this.debugLine.geometry.getAttribute('position');
      points.setXYZ(0, 0, 1, 0); points.setXYZ(1, 0, 1, Math.max(1, state.desiredSpeed));
      const target = state.laneTarget ?? state.position;
      this.group.worldToLocal(this.debugPoint.set(target.x, target.y + .5, target.z));
      points.setXYZ(2, 0, 1, 0); points.setXYZ(3, this.debugPoint.x, this.debugPoint.y, this.debugPoint.z);
      const stop = state.stopTarget ?? state.position;
      this.group.worldToLocal(this.debugPoint.set(stop.x, stop.y + .5, stop.z));
      if (state.stopTarget) {
        points.setXYZ(4, this.debugPoint.x - 1.5, this.debugPoint.y, this.debugPoint.z); points.setXYZ(5, this.debugPoint.x + 1.5, this.debugPoint.y, this.debugPoint.z);
      } else { points.setXYZ(4, 0, 0, 0); points.setXYZ(5, 0, 0, 0); }
      points.needsUpdate = true;
      (this.debugLine.material as LineBasicMaterial).color.setHex(state.activity === 'yieldingCrossing' ? 0xf69cff
        : state.signalColor === 'red' ? 0xff5544 : state.signalColor === 'yellow' || state.activity === 'waitingIntersection' ? 0xffc04d : state.reservationId ? 0x52ed87 : 0x54e8df);
    }
  }
  public setDebugVisible(visible: boolean): void { this.debugLine.visible = visible; }
  public setVisible(visible: boolean): void { this.group.visible = visible; }
  public dispose(scene: Scene): void { scene.remove(this.group); this.debugLine.geometry.dispose(); (this.debugLine.material as LineBasicMaterial).dispose(); }
}
