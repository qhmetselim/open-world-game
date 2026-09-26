import { BoxGeometry, InstancedMesh, MeshStandardMaterial, Object3D } from 'three';
import type { Scene } from 'three';
import type { MoneyDrops } from '../economy/MoneyDrops';
import { policeConfig } from '../police/PoliceConfig';

export class MoneyDropView {
  private readonly geometry = new BoxGeometry(.4,.12,.22);
  private readonly material = new MeshStandardMaterial({ color: 0x75ad7a, roughness: .8 });
  private readonly mesh = new InstancedMesh(this.geometry,this.material,policeConfig.drops.max);
  private readonly transform = new Object3D();
  public constructor(private readonly scene: Scene) { this.mesh.count=0; scene.add(this.mesh); }
  public update(drops: MoneyDrops, loaded: (x:number,z:number)=>boolean): void {
    let index=0;
    for (const drop of drops.active.values()) {
      if (!loaded(drop.position.x,drop.position.z)) continue;
      this.transform.position.set(drop.position.x,drop.position.y+.35+Math.sin(drop.age*3)*.09,drop.position.z);
      this.transform.rotation.y=drop.age; this.transform.updateMatrix(); this.mesh.setMatrixAt(index++,this.transform.matrix);
    }
    this.mesh.count=index; this.mesh.instanceMatrix.needsUpdate=true; this.mesh.computeBoundingSphere();
  }
  public dispose(): void { this.scene.remove(this.mesh); this.mesh.dispose(); this.geometry.dispose(); this.material.dispose(); }
}
