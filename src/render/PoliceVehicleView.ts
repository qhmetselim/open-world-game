import { BoxGeometry, Mesh, MeshBasicMaterial, MeshStandardMaterial } from 'three';
import type { Scene } from 'three';
import type { GameConfig } from '../core/Config';
import type { VehicleState } from '../vehicle/VehicleState';
import { VehicleView } from './VehicleView';

/** Same sedan geometry/physics, lightweight livery and light bar only. */
export class PoliceVehicleView {
  private readonly view:VehicleView;
  private readonly geometry=new BoxGeometry(1,1,1);
  private readonly white=new MeshStandardMaterial({color:0xdce2e5,roughness:.65});
  private readonly red=new MeshBasicMaterial({color:0xf05255});
  private readonly blue=new MeshBasicMaterial({color:0x389bff});
  public constructor(scene:Scene,config:GameConfig['vehicle']['sedan']) {
    this.view=new VehicleView(scene,config);
    for(const x of [-1,1]) {const panel=new Mesh(this.geometry,this.white);panel.scale.set(.025,.35,config.chassisLength*.6);panel.position.set(x*config.chassisWidth*.505,.05,0);this.view.group.add(panel);}
    for(const [x,material] of [[-.3,this.red],[.3,this.blue]] as const){const light=new Mesh(this.geometry,material);light.scale.set(.5,.15,.25);light.position.set(x,config.chassisHeight*1.65,.1);this.view.group.add(light);}
  }
  public update(state:VehicleState):void{this.view.update(state);}
  public dispose():void{this.view.dispose();this.geometry.dispose();this.white.dispose();this.red.dispose();this.blue.dispose();}
}
