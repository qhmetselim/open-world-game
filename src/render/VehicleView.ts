import { BoxGeometry, CylinderGeometry, Group, Mesh, MeshStandardMaterial } from 'three';
import type { Scene } from 'three';
import type { VehicleState } from '../vehicle/VehicleState';
export class VehicleView { public readonly group=new Group(); private readonly meshes: Mesh[]=[];
  public constructor(scene: Scene) { const body=new Mesh(new BoxGeometry(1.85,.55,4.2),new MeshStandardMaterial({color:0x445f78,roughness:.75})); body.position.y=.45; this.group.add(body); this.meshes.push(body); const cabin=new Mesh(new BoxGeometry(1.45,.55,2.1),new MeshStandardMaterial({color:0x9eb5c0,roughness:.55})); cabin.position.set(0,.95,-.2); this.group.add(cabin); this.meshes.push(cabin); for(const x of [-.75,.75]) for(const z of [-1.25,1.25]) { const wheel=new Mesh(new CylinderGeometry(.36,.36,.18,12),new MeshStandardMaterial({color:0x17191b,roughness:.95})); wheel.rotation.z=Math.PI/2; wheel.position.set(x,.12,z); this.group.add(wheel); this.meshes.push(wheel); } scene.add(this.group); }
  public update(state: VehicleState): void { this.group.position.set(state.position.x,state.position.y,state.position.z); this.group.rotation.y=state.yaw; }
  public setVisible(visible:boolean):void{this.group.visible=visible;} public dispose(scene:Scene):void{scene.remove(this.group); for(const m of this.meshes){m.geometry.dispose(); (m.material as MeshStandardMaterial).dispose();}}
}
