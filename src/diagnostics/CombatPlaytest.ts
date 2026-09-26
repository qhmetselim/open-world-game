/** Isolated visual integration fixture. Explicit pointer-command simulation, never a pointer-lock override. */
import '../styles.css';
import { BoxGeometry, Mesh, MeshStandardMaterial, PerspectiveCamera, Vector3 } from 'three';
import { SceneManager } from '../render/SceneManager';
import { Renderer } from '../render/Renderer';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { defaultGameConfig as config } from '../core/Config';
import { NpcManager } from '../npc/NpcManager';
import { CombatController } from '../combat/CombatController';
import { CombatView } from '../render/CombatView';
import { CombatHUD } from '../ui/CombatHUD';
import { PlayerView } from '../render/PlayerView';
import { createPlayerState } from '../player/PlayerState';
import { GameLoop } from '../core/GameLoop';
import type { UrbanMobilityNetwork } from '../city/UrbanMobility';
import { PoliceManager } from '../police/PoliceManager';
import { ShotEffects } from '../render/ShotEffects';
import { MoneyDrops } from '../economy/MoneyDrops';
import { MoneyDropView } from '../render/MoneyDropView';
import { PersonalAssets } from '../economy/PersonalAssets';
import { MoneyHUD } from '../ui/MoneyHUD';
import { WantedHUD } from '../ui/WantedHUD';
import { applyDamage } from '../combat/Health';
import { VehicleController } from '../vehicle/VehicleController';
import { VehicleView } from '../render/VehicleView';

async function start(): Promise<void> {
  if (!import.meta.env.DEV) throw new Error('Development fixture only');
  const host = document.getElementById('app')!, scene = new SceneManager();
  const renderer = new Renderer(host, config.rendering), physics = new PhysicsWorld(); await physics.initialize();
  physics.createStaticBox([0, -.5, 0], [1000, .5, 1000]);
  const groundGeometry = new BoxGeometry(2000, 1, 2000), groundMaterial = new MeshStandardMaterial({ color: 0x829173 });
  const ground = new Mesh(groundGeometry, groundMaterial); ground.position.y = -.5; ground.receiveShadow = true; scene.scene.add(ground);
  const player = createPlayerState({ x: 0, y: 1.03, z: 0 });
  const body = physics.createKinematicCharacter([0, 1.03, 0], .6, .4, .03, .6);
  const npcs = new NpcManager(scene.scene, config.npc, 'combat-qa', () => 0);
  const network: UrbanMobilityNetwork = { lanes: [], intersections: [], crossings: [], laneConnections: [], pedestrianConnections: [],
    pedestrianNodes: [{ id: 'combat-target', position: { x: 0, z: -8 }, side: 'left', roadId: 'fixture', connectionIds: [] }] };
  npcs.fixedUpdate(.016, player.position, network);
  const npc = npcs.getNearestNpc(player.position, 20)!;
  const effects=new ShotEffects(scene.scene),drops=new MoneyDrops(),dropView=new MoneyDropView(scene.scene),assets=new PersonalAssets(0);
  const moneyHud=new MoneyHUD(host),wantedHud=new WantedHUD(host);
  const police=new PoliceManager(scene.scene,physics,config,{height:()=>0,loaded:()=>true,roadValid:()=>true},n=>{applyDamage(player.health,n);},shot=>effects.emit(shot));
  const policeNetwork:UrbanMobilityNetwork={...network,lanes:[{id:'chase',roadId:'r',roadClass:'local',direction:'forward',laneIndex:0,speedMetadata:30,
    startNodeId:'a',endNodeId:'b',path:[{x:-6,z:140},{x:-6,z:-140}]}],
    pedestrianNodes:[{id:'police-goal',position:{x:6,z:-8},roadId:'r',side:'left',connectionIds:['sidewalk']},
      {id:'police-response',position:{x:6,z:45},roadId:'r',side:'left',connectionIds:['sidewalk']}],
    pedestrianConnections:[{id:'sidewalk',fromNodeId:'police-response',toNodeId:'police-goal',type:'sidewalk'}]};
  const cars=[new VehicleController(config.vehicle,physics,'qa:car:A',{x:0,y:1.1,z:8},Math.PI),new VehicleController(config.vehicle,physics,'qa:car:B',{x:8,y:1.1,z:8},Math.PI)];
  const carViews=cars.map(()=>new VehicleView(scene.scene,config.vehicle.sedan));cars.forEach(c=>c.initialize());
  let controlled:VehicleController|undefined,drive=false,walk=0,coverAdded=false;
  const combat = new CombatController(physics, {getNearbyActive:(p,r)=>[...npcs.getNearbyActive(p,r),...police.getNearbyActive(p,r)],damage:(id,n)=>id.startsWith('police:')?police.damage(id,n):npcs.damage(id,n)}), view = new CombatView(scene.scene), playerView = new PlayerView(scene.scene), hud = new CombatHUD(host);
  const camera = new PerspectiveCamera(60, innerWidth / innerHeight, .1, 1500);
  camera.position.set(2, 2.5, 5); camera.lookAt(0, 1.05, -8); const direction = camera.getWorldDirection(new Vector3());
  const panel = document.createElement('nav'), output = document.createElement('output');
  panel.style.cssText = 'position:fixed;left:12px;bottom:20px;background:#16252eee;padding:12px;color:white;z-index:5';
  panel.append('Isolated QA · simulated pointer commands · real Rapier/NPC', document.createElement('br'));
  let equip = false, fire = false, reload = false, aim = false, allowed = true;
  for (const [label, action] of [['Equip / holster', () => { equip = true; }], ['Aim', () => { aim = !aim; }],
    ['Fire', () => { fire = true; }], ['Reload', () => { reload = true; }], ['Walk to drop', () => { walk=2.6; }],
    ['Response overview',()=>{camera.position.set(24,20,48);camera.lookAt(0,1,14);}],
    ['Enter / switch sedan',()=>{controlled=controlled===cars[0]?cars[1]:cars[0];allowed=false;body.body.setEnabled(false);combat.holster();}],
    ['Drive / brake',()=>{drive=!drive;}],['Exit sedan',()=>{if(controlled){Object.assign(player.position,{...controlled.getState().position,x:controlled.getState().position.x+3});controlled=undefined;body.body.setTranslation(player.position,true);body.body.setEnabled(true);allowed=true;}}],
    ['Lose sight (cover)',()=>{if(coverAdded)return;coverAdded=true;physics.createStaticBox([0,3,16],[80,3,.4]);const mesh=new Mesh(groundGeometry,groundMaterial);mesh.scale.set(.08,6,.0004);mesh.position.set(0,3,16);scene.scene.add(mesh);}],
    ['Reset health/wanted',()=>{player.health.current=100;police.reset();}]] as const) {
    const button = document.createElement('button'); button.textContent = label; button.onclick = action; panel.append(button);
  }
  panel.append(document.createElement('br'), output); host.append(panel);
  const events: string[] = []; combat.subscribe((event) => {
    events.push(event.type); if (events.length > 8) events.shift();police.wanted.crime(event,player.position);
    if(event.type==='weaponFired'&&combat.lastShot)effects.emit(combat.lastShot);
    if(event.type==='npcKilled'&&event.position)drops.spawn(event.npcId,event.position);
  });
  const loop = new GameLoop({
    fixedUpdate: (dt) => {
      if(walk>0&&allowed){walk-=dt;const movement=physics.computeCharacterMovement(body,[0,-.03,-3*dt]);
        player.position.x+=movement.translation[0];player.position.y+=movement.translation[1];player.position.z+=movement.translation[2];
        physics.moveKinematicCharacter(body,[player.position.x,player.position.y,player.position.z]);}
      for(const car of cars)if(car===controlled)car.drive({throttle:Number(drive),brake:Number(!drive),steering:0,reverse:0,handbrake:false},dt);else car.idleFixedUpdate(dt);
      police.step(dt,{position:player.position,body:controlled?.getBody()??body.body,onFoot:allowed,alive:player.health.current>0},policeNetwork,{x:player.position.x,y:3,z:player.position.z+5},{x:0,y:0,z:-1});
      physics.step(dt);police.captureAfterStep();cars.forEach(c=>c.syncFromPhysics());
      if(controlled)Object.assign(player.position,controlled.getState().position);
      npcs.fixedUpdate(dt, player.position, network);
      combat.step(dt, { allowed:allowed&&player.health.current>0, locked: true, equip, aim, fire, reload }, player.position, camera.position, direction, body.body);
      drops.step(dt,player.position,allowed,assets,(a,b)=>physics.hasInteractionLineOfSight(a,b,body.body,undefined));
      equip = false; fire = false; reload = false;
    },
    update: () => undefined,
    render: () => {
      playerView.setVisible(allowed); playerView.update(player, combat.state.equipped);
      npcs.render(1/60);police.render(1,1/60);effects.update(1/60);dropView.update(drops,()=>true);moneyHud.update(assets.balance);wantedHud.update(police.wanted.state,player.health.current===0);
      cars.forEach((c,i)=>carViews[i]!.update(c.getRenderState(1)));
      view.update(player, combat.state, direction, combat.flashRemaining); hud.update(combat, player.health, allowed);
      const response=police.getDebugInfo();
      output.textContent = `NPC HP ${npc.health.current} · ${npc.activity} · Shots ${combat.state.shotsFired} · ${allowed ? 'on foot' : controlled?.getState().id} z=${player.position.z.toFixed(1)} · Police ${response.officers}/${response.cars} z=${police.getVehicleObstacles().map(c=>c.z.toFixed(1)).join('/')} · Engage ${response.engaging} · Drops ${drops.active.size} · HP ${player.health.current} · ${events.join(', ')}`;
      scene.update(camera); renderer.render(scene.scene, camera);
    }
  }, config.physics); loop.start();
  window.addEventListener('pagehide', () => {
    loop.stop(); hud.dispose(); combat.dispose(); view.dispose(); playerView.dispose(scene.scene); npcs.dispose();
    police.dispose();effects.dispose();dropView.dispose();moneyHud.dispose();wantedHud.dispose();cars.forEach(c=>c.dispose());carViews.forEach(v=>v.dispose());
    groundGeometry.dispose(); groundMaterial.dispose(); scene.dispose(); physics.dispose(); renderer.dispose(); panel.remove();
  }, { once: true });
}
void start().catch((error: unknown) => { document.body.textContent = String(error); console.error(error); });
