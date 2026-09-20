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

async function start(): Promise<void> {
  if (!import.meta.env.DEV) throw new Error('Development fixture only');
  const host = document.getElementById('app')!, scene = new SceneManager();
  const renderer = new Renderer(host, config.rendering), physics = new PhysicsWorld(); await physics.initialize();
  physics.createStaticBox([0, -.5, 0], [25, .5, 25]);
  const groundGeometry = new BoxGeometry(50, 1, 50), groundMaterial = new MeshStandardMaterial({ color: 0x829173 });
  const ground = new Mesh(groundGeometry, groundMaterial); ground.position.y = -.5; ground.receiveShadow = true; scene.scene.add(ground);
  const player = createPlayerState({ x: 0, y: 1.03, z: 0 });
  const body = physics.createKinematicCharacter([0, 1.03, 0], .6, .4, .03, .6);
  const npcs = new NpcManager(scene.scene, config.npc, 'combat-qa', () => 0);
  const network: UrbanMobilityNetwork = { lanes: [], intersections: [], crossings: [], laneConnections: [], pedestrianConnections: [],
    pedestrianNodes: [{ id: 'combat-target', position: { x: 0, z: -8 }, side: 'left', roadId: 'fixture', connectionIds: [] }] };
  npcs.fixedUpdate(.016, player.position, network);
  const npc = npcs.getNearestNpc(player.position, 20)!;
  const combat = new CombatController(physics, npcs), view = new CombatView(scene.scene), playerView = new PlayerView(scene.scene), hud = new CombatHUD(host);
  const camera = new PerspectiveCamera(60, innerWidth / innerHeight, .1, 1500);
  camera.position.set(2, 2.5, 5); camera.lookAt(0, 1.05, -8); const direction = camera.getWorldDirection(new Vector3());
  const panel = document.createElement('nav'), output = document.createElement('output');
  panel.style.cssText = 'position:fixed;left:12px;bottom:20px;background:#16252eee;padding:12px;color:white;z-index:5';
  panel.append('Isolated QA · simulated pointer commands · real Rapier/NPC', document.createElement('br'));
  let equip = false, fire = false, reload = false, aim = false, allowed = true;
  for (const [label, action] of [['Equip / holster', () => { equip = true; }], ['Aim', () => { aim = !aim; }],
    ['Fire', () => { fire = true; }], ['Reload', () => { reload = true; }], ['Vehicle context', () => { allowed = !allowed; }]] as const) {
    const button = document.createElement('button'); button.textContent = label; button.onclick = action; panel.append(button);
  }
  panel.append(document.createElement('br'), output); host.append(panel);
  const events: string[] = []; combat.subscribe((event) => { events.push(event.type); if (events.length > 8) events.shift(); });
  const loop = new GameLoop({
    fixedUpdate: (dt) => {
      physics.step(dt); npcs.fixedUpdate(dt, player.position, network);
      combat.step(dt, { allowed, locked: true, equip, aim, fire, reload }, player.position, camera.position, direction, body.body);
      equip = false; fire = false; reload = false;
    },
    update: () => undefined,
    render: () => {
      playerView.setVisible(allowed); playerView.update(player, combat.state.equipped, combat.state.aiming ? direction : undefined);
      npcs.render(1/60); view.update(player, combat.state, direction, combat.flashRemaining); hud.update(combat, player.health, allowed);
      output.textContent = `NPC HP ${npc.health.current} · ${npc.activity} · Shots ${combat.state.shotsFired} · ${allowed ? 'on foot' : 'vehicle'} · ${events.join(', ')}`;
      scene.update(camera); renderer.render(scene.scene, camera);
    }
  }, config.physics); loop.start();
  window.addEventListener('pagehide', () => {
    loop.stop(); hud.dispose(); combat.dispose(); view.dispose(); playerView.dispose(scene.scene); npcs.dispose();
    groundGeometry.dispose(); groundMaterial.dispose(); scene.dispose(); physics.dispose(); renderer.dispose(); panel.remove();
  }, { once: true });
}
void start().catch((error: unknown) => { document.body.textContent = String(error); console.error(error); });
