/** Development-only visual fixture: production world/AI/renderer, no gameplay state overrides. */
import '../styles.css';
import { PerspectiveCamera } from 'three';
import { defaultGameConfig as config } from '../core/Config';
import { GameLoop } from '../core/GameLoop';
import { World } from '../world/World';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { SceneManager } from '../render/SceneManager';
import { Renderer } from '../render/Renderer';
import { TrafficManager } from '../traffic/TrafficManager';
import { NpcManager } from '../npc/NpcManager';

async function start(): Promise<void> {
  if (!import.meta.env.DEV) throw new Error('QA fixture is development-only.');
  const host = document.getElementById('app')!;
  const scene = new SceneManager(); const renderer = new Renderer(host, config.rendering);
  const physics = new PhysicsWorld(); await physics.initialize();
  const world = new World(config.world, config.city, config.building, config.player.spawnPosition, true);
  const focus = { x: 210, z: 210 }; const observer = { getWorldPosition: () => focus };
  world.initialize(scene.scene, physics, observer);
  const traffic = new TrafficManager(scene.scene, physics, config.traffic, config.vehicle.sedan, config.world.seed, (x, z) => world.getTerrainHeight(x, z), (lane, x, z) => world.isTrafficLaneLoaded(lane, x, z));
  const npcs = new NpcManager(scene.scene, config.npc, config.world.seed, (x, z, surface) => world.getWalkableSurfaceHeight(x, z, surface));
  const camera = new PerspectiveCamera(60, innerWidth / innerHeight, .1, 1500);
  const controls = document.createElement('div'); controls.style.cssText = 'position:fixed;top:8px;left:8px;z-index:10;background:#16252ee8;color:white;padding:10px;font:12px monospace;max-width:80vw';
  const output = document.createElement('pre'); output.style.cssText = 'white-space:pre-wrap;overflow-wrap:anywhere'; controls.append(output); host.append(controls);
  let mode: 'junction' | 'traffic' | 'pedestrian' = 'junction'; let intersectionIndex = 0;
  const intersections = world.getPedestrianNetworkAround(focus).intersections.filter((i) => Math.hypot(i.position.x - focus.x, i.position.z - focus.z) < 130);
  const button = (label: string, action: () => void) => { const b = document.createElement('button'); b.textContent = label; b.onclick = action; controls.append(b); };
  button('Next intersection', () => { mode = 'junction'; intersectionIndex++; });
  button('Follow traffic', () => { mode = 'traffic'; });
  button('Follow pedestrian', () => { mode = 'pedestrian'; });
  button('Network debug (F4)', () => world.toggleRoadGraphDebug());
  let delta = 1 / 60; let frames = 0; let elapsed = 0;
  const loop = new GameLoop({ fixedUpdate: (dt) => {
    const network = world.getPedestrianNetworkAround(focus);
    traffic.fixedUpdate(dt, focus, network, undefined); physics.step(dt); traffic.captureAfterStep(); npcs.fixedUpdate(dt, focus, network);
  }, update: (frame) => { delta = frame.deltaSeconds; world.updateStreaming(observer); }, render: (alpha) => {
    const junction = intersections[intersectionIndex % intersections.length];
    let target = junction ? { ...junction.position, y: world.getTerrainHeight(junction.position.x, junction.position.z) } : { ...focus, y: 0 };
    if (mode === 'traffic') target = traffic.getStates().find((s) => s.tier === 'active' && s.speed > .5)?.position ?? target;
    if (mode === 'pedestrian') target = npcs.getNearestNpc(target, 150)?.position ?? target;
    const distance = mode === 'junction' ? 32 : mode === 'traffic' ? 12 : 7;
    // Junction inspection stays above the road footprint, not inside a neighbouring facade.
    camera.position.set(target.x + distance * (mode === 'junction' ? .15 : .6), target.y + distance * .8, target.z + distance * (mode === 'junction' ? .15 : 1)); camera.lookAt(target.x, target.y, target.z);
    camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
    traffic.render(alpha); npcs.render(delta); renderer.render(scene.scene, camera);
    elapsed += delta; frames++;
    if (elapsed > .5) {
      const t = traffic.getDebugInfo();
      output.textContent = `DEV QA · ${mode} · ${Math.round(frames / elapsed)} FPS\nDraw ${renderer.drawCalls} · Tri ${renderer.triangleCount} · Bodies ${physics.bodyCount}\nTraffic ${t.activeCount}/8 · Background ${t.backgroundCount} · Routes ${t.routeTransitions}\nSpins ${t.spinCount} · Recoveries ${t.recoveryCount} · Rejected ${t.rejectedSpawns}\nNPC ${npcs.getDebugInfo().activeCount}/20 · junction ${junction?.id ?? 'none'}`;
      elapsed = 0; frames = 0;
    }
  } }, config.physics);
  // Use the same 60 Hz/max-substep settings as the game.
  loop.start();
  window.addEventListener('pagehide', () => { loop.stop(); traffic.dispose(); npcs.dispose(); world.dispose(); physics.dispose(); renderer.dispose(); scene.dispose(); }, { once: true });
}
void start().catch((error: unknown) => { document.body.textContent = String(error); console.error(error); });
