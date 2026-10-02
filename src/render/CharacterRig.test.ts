import { readFile } from 'node:fs/promises';
import { Box3, Mesh, Scene, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { expect, it } from 'vitest';
import { CharacterResources, CharacterRig } from './CharacterRig';
import { CombatView } from './CombatView';
import { createPlayerState } from '../player/PlayerState';
import { createCombatState } from '../combat/CombatState';
import { combatConfig } from '../combat/CombatConfig';

const look = { shirt: 0x386d79, pants: 0x35424c, skin: 0xd6a57b, hair: 0x30251f, hairStyle: 1, clothingStyle: 1 };
async function resources() {
  const bytes = await readFile(new URL('../../assets/models/characters/human.glb', import.meta.url));
  const source = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  return new CharacterResources(source.scene);
}
it('real GLB assembles upright at feet origin and shares bounded rigid parts across identities', async () => {
  const shared = await resources(), a = new CharacterRig(shared, look), b = new CharacterRig(shared, look);
  const bounds = new Box3().setFromObject(a.root);
  expect(bounds.min.y).toBeCloseTo(0, 4);
  expect(bounds.max.y).toBeGreaterThan(1.9); expect(bounds.max.y).toBeLessThan(2.05);
  const meshes: Mesh[] = []; a.root.traverse(o => { if (o instanceof Mesh) meshes.push(o); });
  expect(meshes).toHaveLength(13);
  const other: Mesh[] = []; b.root.traverse(o => { if (o instanceof Mesh) other.push(o); });
  meshes.forEach((mesh, i) => { expect(mesh.geometry).toBe(other[i]!.geometry); expect(mesh.material).toBe(shared.material); });
  let disposed = 0; meshes[0]!.geometry.addEventListener('dispose', () => disposed++);
  a.root.removeFromParent(); expect(disposed).toBe(0); shared.dispose(); expect(disposed).toBe(1);
});
it('right hand follows the existing pistol grip and walk/aim transforms remain finite', async () => {
  const shared=await resources(), rig=new CharacterRig(shared,look), scene=new Scene(), gun=new CombatView(scene);
  scene.add(rig.root);
  const player=createPlayerState({x:0,y:.94,z:0});player.facingYaw=Math.PI;
  const weapon=createCombatState(combatConfig.pistol);weapon.equipped=true;weapon.aiming=true;
  gun.update(player,weapon,{x:0,y:0,z:1},0);rig.walk(4,1/60);rig.holdPistol(gun.getGripPosition());
  rig.root.updateMatrixWorld(true);
  const forearm=rig.rightArm.children.find(o=>o.type==='Group')!;
  const hand=forearm.localToWorld(new Vector3(0,-.285,0));
  expect(hand.distanceTo(gun.getGripPosition())).toBeLessThan(.035);
  for(let i=0;i<120;i++){rig.walk(4,1/60);rig.root.updateMatrixWorld(true);}
  rig.root.traverse(o=>expect(o.matrixWorld.elements.every(Number.isFinite)).toBe(true));
  gun.dispose();shared.dispose();
});
it('articulated gait keeps feet above ground and blends from walk into a distinct sprint pose', async () => {
  const shared=await resources(), rig=new CharacterRig(shared,look);
  for (const speed of [0,1.4,7,12,0]) for(let frame=0;frame<120;frame++) {
    rig.walk(speed,1/60,true,Math.max(0,Math.min(1,(speed-7)/5)));
    rig.root.updateMatrixWorld(true);
    for(const foot of [rig.leftFoot,rig.rightFoot]) {
      const sole=foot.localToWorld(new Vector3(0,-.14,0));
      expect(sole.y).toBeGreaterThanOrEqual(-.002);
      expect(sole.y).toBeLessThan(.3);
    }
    expect(Number.isFinite(rig.leftKnee.rotation.x)).toBe(true);
  }
  shared.dispose();
});
it('draw and holster retain visible intermediate poses without changing combat state', () => {
  const scene=new Scene(), gun=new CombatView(scene), player=createPlayerState({x:0,y:1,z:0});
  const weapon=createCombatState(combatConfig.pistol); weapon.equipped=true;
  gun.update(player,weapon,{x:0,y:0,z:-1},0,.1);
  const early=gun.getGripPosition().clone();
  expect(gun.presenting).toBe(true);
  gun.update(player,weapon,{x:0,y:0,z:-1},0,.3);
  expect(gun.getGripPosition().distanceTo(early)).toBeGreaterThan(.1);
  weapon.equipped=false;
  gun.update(player,weapon,{x:0,y:0,z:-1},0,.1);expect(gun.presenting).toBe(true);
  gun.update(player,weapon,{x:0,y:0,z:-1},0,.3);expect(gun.presenting).toBe(false);
  expect(weapon.equipped).toBe(false);gun.dispose();
});
