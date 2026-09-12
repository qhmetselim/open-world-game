import { BoxGeometry, CylinderGeometry, Group, Line, LineBasicMaterial, Mesh, MeshStandardMaterial, Vector3 } from 'three';
import type { Scene } from 'three';
import type { GameConfig } from '../core/Config';
import type { TrafficVehicleState } from '../traffic/TrafficTypes';

export class TrafficVehicleRenderResources {
  public readonly chassis: BoxGeometry;
  public readonly cabin: BoxGeometry;
  public readonly wheel: CylinderGeometry;
  private readonly colors = new Map<number, MeshStandardMaterial>();
  public readonly wheelMaterial = new MeshStandardMaterial({ color: 0x1c1e20, roughness: 0.92 });
  public readonly glassMaterial = new MeshStandardMaterial({ color: 0x8faabd, roughness: 0.45 });
  public constructor(config: GameConfig['vehicle']['sedan']) {
    this.chassis = new BoxGeometry(config.chassisWidth, config.chassisHeight, config.chassisLength);
    this.cabin = new BoxGeometry(config.chassisWidth * .78, config.chassisHeight * .88, config.chassisLength * .5);
    this.wheel = new CylinderGeometry(config.wheelRadius, config.wheelRadius, .18, 10);
  }
  public bodyMaterial(color: number): MeshStandardMaterial {
    const cached = this.colors.get(color);
    if (cached !== undefined) return cached;
    const material = new MeshStandardMaterial({ color, roughness: .72 });
    this.colors.set(color, material);
    return material;
  }
  public dispose(): void { this.chassis.dispose(); this.cabin.dispose(); this.wheel.dispose(); this.wheelMaterial.dispose(); this.glassMaterial.dispose(); this.colors.forEach((material) => material.dispose()); this.colors.clear(); }
}

export class TrafficVehicleView {
  private readonly group = new Group();
  private readonly wheelPivots: Group[] = [];
  private readonly wheels: Mesh[] = [];
  private readonly debugLine = new Line(undefined, new LineBasicMaterial({ color: 0x54e8df }));
  public constructor(scene: Scene, resources: TrafficVehicleRenderResources, private readonly config: GameConfig['vehicle']['sedan'], state: TrafficVehicleState) {
    const chassis = new Mesh(resources.chassis, resources.bodyMaterial(state.color)); chassis.castShadow = true; this.group.add(chassis);
    const cabin = new Mesh(resources.cabin, resources.glassMaterial); cabin.position.set(0, config.chassisHeight * 1.12, config.chassisLength * .08); cabin.castShadow = true; this.group.add(cabin);
    for (const [x, z] of [[-config.trackWidth / 2, config.wheelBase / 2], [config.trackWidth / 2, config.wheelBase / 2], [-config.trackWidth / 2, -config.wheelBase / 2], [config.trackWidth / 2, -config.wheelBase / 2]] as const) {
      const pivot = new Group(); pivot.position.set(x, -config.chassisHeight / 2 - config.suspensionRestLength, z);
      const wheel = new Mesh(resources.wheel, resources.wheelMaterial); wheel.rotation.z = Math.PI / 2; wheel.castShadow = true; pivot.add(wheel); this.group.add(pivot); this.wheelPivots.push(pivot); this.wheels.push(wheel);
    }
    this.debugLine.geometry.setFromPoints([new Vector3(), new Vector3(0, 0, 3)]); this.debugLine.visible = false; this.group.add(this.debugLine); scene.add(this.group);
  }
  public update(state: TrafficVehicleState): void {
    this.group.position.set(state.position.x, state.position.y, state.position.z); this.group.quaternion.set(state.rotation.x, state.rotation.y, state.rotation.z, state.rotation.w);
    for (let index = 0; index < this.wheelPivots.length; index += 1) {
      const pivot = this.wheelPivots[index]; const wheel = this.wheels[index]; if (pivot === undefined || wheel === undefined) continue;
      pivot.position.y = -this.config.chassisHeight / 2 - (state.suspensionLengths[index] ?? this.config.suspensionRestLength);
      pivot.rotation.y = index < 2 ? state.steering : 0; wheel.rotation.x = state.wheelRotations[index] ?? 0;
    }
  }
  public setDebugVisible(visible: boolean): void { this.debugLine.visible = visible; }
  public dispose(scene: Scene): void { scene.remove(this.group); this.debugLine.geometry.dispose(); (this.debugLine.material as LineBasicMaterial).dispose(); }
}
