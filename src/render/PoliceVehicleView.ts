import type { Scene } from 'three';
import type { GameConfig } from '../core/Config';
import type { VehicleState } from '../vehicle/VehicleState';
import { VehicleView } from './VehicleView';

/** Police-specific GLB coachwork; same suspension/steering pivots and physics contract. */
export class PoliceVehicleView {
  private readonly view:VehicleView;
  public constructor(scene:Scene,config:GameConfig['vehicle']['sedan']) {
    this.view=new VehicleView(scene,config,'police');
  }
  public update(state:VehicleState):void{this.view.update(state);}
  public setVisible(visible:boolean):void{this.view.setVisible(visible);}
  public setDoorOpen(side: -1 | 1, amount: number): void { this.view.setDoorOpen(side, amount); }
  public setDebugVisible(visible:boolean):void{this.view.setDebugVisible(visible);}
  public dispose():void{this.view.dispose();}
}
