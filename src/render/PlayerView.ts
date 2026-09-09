import {
  BoxGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry
} from 'three';
import type { Scene } from 'three';
import type { PlayerState } from '../player/PlayerState';

export class PlayerView {
  private readonly root = new Group();
  private readonly geometries: Array<BoxGeometry | CylinderGeometry | SphereGeometry> = [];
  private readonly materials: MeshStandardMaterial[] = [];

  public constructor(scene: Scene) {
    const bodyMaterial = this.createMaterial(0x2f6db0);
    const skinMaterial = this.createMaterial(0xe2a675);
    const legMaterial = this.createMaterial(0x263446);
    this.addMesh(new CylinderGeometry(0.34, 0.42, 1.15, 8), bodyMaterial, 0, 0, 0);
    this.addMesh(new SphereGeometry(0.3, 12, 8), skinMaterial, 0, 0.85, 0);
    this.addMesh(new BoxGeometry(0.16, 0.75, 0.16), bodyMaterial, -0.45, 0.02, 0);
    this.addMesh(new BoxGeometry(0.16, 0.75, 0.16), bodyMaterial, 0.45, 0.02, 0);
    this.addMesh(new BoxGeometry(0.2, 0.75, 0.22), legMaterial, -0.18, -0.9, 0);
    this.addMesh(new BoxGeometry(0.2, 0.75, 0.22), legMaterial, 0.18, -0.9, 0);
    scene.add(this.root);
  }

  public update(state: PlayerState): void {
    this.root.position.set(state.position.x, state.position.y, state.position.z);
    this.root.rotation.y = state.facingYaw;
  }

  public dispose(scene: Scene): void {
    scene.remove(this.root);
    this.geometries.forEach((geometry) => geometry.dispose());
    this.materials.forEach((material) => material.dispose());
  }

  private createMaterial(color: number): MeshStandardMaterial {
    const material = new MeshStandardMaterial({ color, roughness: 0.72 });
    this.materials.push(material);
    return material;
  }

  private addMesh(
    geometry: BoxGeometry | CylinderGeometry | SphereGeometry,
    material: MeshStandardMaterial,
    x: number,
    y: number,
    z: number
  ): void {
    this.geometries.push(geometry);
    const mesh = new Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    this.root.add(mesh);
  }
}
