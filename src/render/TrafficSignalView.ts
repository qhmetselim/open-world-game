import { BoxGeometry, BufferAttribute, BufferGeometry, Color, Group, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, MeshStandardMaterial, SphereGeometry, Vector3 } from 'three';
import type { Scene } from 'three';
import type { SignalApproach, SignalColor, TrafficRuleConfig } from '../traffic/TrafficRules';
import { appendRibbon } from '../city/MobilityGeometry';

/** Three batches for a bounded set of approaches, shared primitives/materials; no physics. */
export class TrafficSignalView {
  private readonly root = new Group();
  private readonly box = new BoxGeometry(1, 1, 1);
  private readonly sphere = new SphereGeometry(.13, 8, 6);
  private readonly structureMaterial = new MeshStandardMaterial({ color: 0xffffff, roughness: .8 });
  private readonly lampMaterial = new MeshBasicMaterial({ color: 0xffffff });
  private readonly lineMaterial = new MeshBasicMaterial({ color: 0xeee9cc });
  private structure?: InstancedMesh;
  private lamps?: InstancedMesh;
  private lines?: Mesh;
  private visible: readonly SignalApproach[] = [];
  private key = '';
  private colors = '';
  public constructor(scene: Scene, private readonly config: TrafficRuleConfig, private readonly height: (x: number, z: number) => number) { scene.add(this.root); }
  public get count(): number { return new Set(this.visible.map((a) => a.intersectionId)).size; }
  public sync(approaches: readonly SignalApproach[], stopLines: ReadonlyMap<string, { stopPoint: { x: number; z: number } }>): void {
    const key = approaches.map((a) => a.id).join('|'); if (key === this.key) return;
    this.clearBatches(); this.key = key; this.colors = ''; this.visible = approaches;
    if (!approaches.length) return;
    this.structure = new InstancedMesh(this.box, this.structureMaterial, approaches.length * 2);
    this.lamps = new InstancedMesh(this.sphere, this.lampMaterial, approaches.length * 3);
    const linePositions: number[] = []; const lineIndices: number[] = [];
    const matrix = new Matrix4(); const scale = new Vector3();
    approaches.forEach((a, index) => {
      const y = this.height(a.position.x, a.position.z); const h = this.config.signalPoleHeight;
      matrix.makeRotationY(a.yaw).scale(scale.set(.12, h, .12)).setPosition(a.position.x, y + h / 2, a.position.z);
      this.structure!.setMatrixAt(index * 2, matrix); this.structure!.setColorAt(index * 2, new Color(0x646a6d));
      matrix.makeRotationY(a.yaw).scale(scale.set(.48, 1.12, .25)).setPosition(a.position.x, y + h, a.position.z);
      this.structure!.setMatrixAt(index * 2 + 1, matrix); this.structure!.setColorAt(index * 2 + 1, new Color(0x171c20));
      for (let lamp = 0; lamp < 3; lamp++) {
        matrix.makeTranslation(a.position.x - Math.sin(a.yaw) * .15, y + h + (.34 - lamp * .34), a.position.z - Math.cos(a.yaw) * .15);
        this.lamps!.setMatrixAt(index * 3 + lamp, matrix);
      }
      for (const id of a.laneIds) {
        const p = stopLines.get(id)!.stopPoint;
        const halfWidth = this.config.laneWidth * .45;
        // Same terrain-conforming ribbon builder as lane/crosswalk markings; no level box on a slope.
        appendRibbon(linePositions, lineIndices, [
          { x: p.x - Math.cos(a.yaw) * halfWidth, z: p.z + Math.sin(a.yaw) * halfWidth },
          { x: p.x + Math.cos(a.yaw) * halfWidth, z: p.z - Math.sin(a.yaw) * halfWidth }
        ], { x: Math.sin(a.yaw), z: Math.cos(a.yaw) }, 0, .18, this.height, this.config.stopLineSurfaceOffset);
      }
    });
    for (const mesh of [this.structure, this.lamps]) {
      mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingBox(); mesh.computeBoundingSphere(); this.root.add(mesh);
    }
    const geometry = new BufferGeometry(); geometry.setAttribute('position', new BufferAttribute(new Float32Array(linePositions), 3)); geometry.setIndex(lineIndices);
    geometry.computeBoundingBox(); geometry.computeBoundingSphere(); this.lines = new Mesh(geometry, this.lineMaterial); this.root.add(this.lines);
  }
  public update(states: readonly SignalColor[]): void {
    if (!this.lamps) return;
    const key = states.join(); if (key === this.colors) return;
    this.colors = key;
    const hues = [0xff3028, 0xffbd28, 0x39ed71]; const names = ['red', 'yellow', 'green'];
    states.forEach((state, i) => { for (let lamp = 0; lamp < 3; lamp++) this.lamps!.setColorAt(i * 3 + lamp, new Color(hues[lamp]).multiplyScalar(names[lamp] === state ? 1 : .1)); });
    this.lamps.instanceColor!.needsUpdate = true;
  }
  private clearBatches(): void { this.structure?.dispose(); this.lamps?.dispose(); this.lines?.geometry.dispose(); this.root.clear(); this.structure = undefined; this.lamps = undefined; this.lines = undefined; }
  public dispose(scene: Scene): void { this.clearBatches(); scene.remove(this.root); this.box.dispose(); this.sphere.dispose(); this.structureMaterial.dispose(); this.lampMaterial.dispose(); this.lineMaterial.dispose(); }
}
