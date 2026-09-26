import { BufferAttribute, BufferGeometry, Line, LineBasicMaterial, Mesh, MeshBasicMaterial, SphereGeometry } from 'three';
import type { Scene } from 'three';
import type { ShotFeedback } from '../combat/CombatController';
import { combatConfig } from '../combat/CombatConfig';

/** Fixed-size effect pool. Exact hitscan endpoints, no simulated bullets or particle allocation. */
export class ShotEffects {
  private readonly geometry = new SphereGeometry(1,6,4);
  private readonly lineMaterial = new LineBasicMaterial({color:0xffda8c});
  private readonly worldMaterial = new MeshBasicMaterial({color:0xe1be83});
  private readonly hitMaterial = new MeshBasicMaterial({color:0xffeeee});
  private readonly slots: {line:Line;impact:Mesh;age:number;hit:boolean}[]=[];
  private cursor=0;
  public constructor(private readonly scene:Scene) {
    for(let i=0;i<12;i++) {
      const geometry=new BufferGeometry(); geometry.setAttribute('position',new BufferAttribute(new Float32Array(6),3));
      const line=new Line(geometry,this.lineMaterial),impact=new Mesh(this.geometry,this.worldMaterial);
      line.visible=false;impact.visible=false;scene.add(line,impact);this.slots.push({line,impact,age:Infinity,hit:false});
    }
  }
  public emit(shot:ShotFeedback):void {
    const slot=this.slots[this.cursor++%this.slots.length]!;slot.age=0;slot.hit=shot.hit!==undefined;
    const attr=slot.line.geometry.getAttribute('position') as BufferAttribute;
    attr.setXYZ(0,shot.from.x,shot.from.y,shot.from.z);attr.setXYZ(1,shot.to.x,shot.to.y,shot.to.z);attr.needsUpdate=true;
    slot.line.geometry.computeBoundingSphere();slot.impact.position.set(shot.to.x,shot.to.y,shot.to.z);
    slot.impact.material=shot.hit==='npc'?this.hitMaterial:this.worldMaterial;
  }
  public update(dt:number):void {
    for(const slot of this.slots) {slot.age+=dt;slot.line.visible=slot.age<combatConfig.feedback.tracerSeconds;
      slot.impact.visible=slot.hit&&slot.age<combatConfig.feedback.impactSeconds;
      slot.impact.scale.setScalar(.06+Math.min(slot.age,.2)*.5);}
  }
  public dispose():void {
    for(const slot of this.slots){this.scene.remove(slot.line,slot.impact);slot.line.geometry.dispose();}
    this.geometry.dispose();this.lineMaterial.dispose();this.worldMaterial.dispose();this.hitMaterial.dispose();
  }
}
