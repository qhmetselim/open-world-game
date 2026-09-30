/** Development-only visual fixture using real World streaming and render owners. No gameplay hooks. */
import { PerspectiveCamera } from 'three';
import { defaultGameConfig as config } from '../core/Config';
import { World } from '../world/World';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { coreModels } from './loaders/CoreModels';
import { SceneManager } from './SceneManager';
import { Renderer } from './Renderer';
import type { BuildingData } from '../buildings/BuildingTypes';

async function review(): Promise<void> {
  if (!import.meta.env.DEV) return;
  await coreModels.initialize();
  const physics = new PhysicsWorld(); await physics.initialize();
  const world = new World(config.world, config.city, config.building, config.player.spawnPosition, false);
  const scene = new SceneManager(); const renderer = new Renderer(document.body, config.rendering);
  const camera = new PerspectiveCamera(55, innerWidth / innerHeight, .1, 1000);
  const position = { x: 0, y: 0, z: 0 }; const focus = { getWorldPosition: () => position };
  world.initialize(scene.scene, physics, focus);
  let candidates: readonly BuildingData[] = [], index = 0, overview = false, frame = 0, last = performance.now(), fps = 0;
  const show = () => {
    const b = candidates[index % candidates.length]; if (!b) return;
    const forward = { x: -Math.sin(b.rotation), z: -Math.cos(b.rotation) };
    const right = { x: Math.cos(b.rotation), z: -Math.sin(b.rotation) };
    const distance = overview ? Math.min(80, Math.max(b.width, b.depth) * .45 + 20) : 20;
    camera.position.set(b.entrance.x + forward.x * distance + right.x * (overview ? b.width * .32 : 9), b.baseElevation + (overview ? 48 : 3.6), b.entrance.z + forward.z * distance + right.z * (overview ? b.width * .32 : 9));
    camera.lookAt(b.entrance.x, b.baseElevation + (overview ? b.height * .35 : 3.8), b.entrance.z);
    Object.assign(position, camera.position); world.updateStreaming(focus); world.updateEnvironmentVisibility(position);
  };
  const area = (n: number) => {
    Object.assign(position, { x: [12, 524, -500][n]!, y: 0, z: 12 }); world.updateStreaming(focus);
    candidates = world.getBuildingsInRegion({ x: Math.floor(position.x / config.city.regionSize), z: 0 }); index = 0; show();
  };
  document.querySelectorAll<HTMLButtonElement>('[data-area]').forEach(button => button.addEventListener('click', () => area(Number(button.dataset.area))));
  document.querySelector('#next')!.addEventListener('click', () => { index++; show(); });
  document.querySelector('#view')!.addEventListener('click', () => { overview = !overview; show(); });
  area(0);
  const tick = (time: number) => {
    const elapsed = time - last; last = time; fps += ((1000 / Math.max(elapsed, 1)) - fps) * .05;
    camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); scene.update(camera); renderer.render(scene.scene, camera);
    const debug = world.getDebugInfo(), b = candidates[index % candidates.length];
    document.querySelector('#status')!.textContent = `${b?.type ?? 'empty'} · ${b?.region.x ?? '?'}:${b?.region.z ?? '?'} · ${Math.round(fps)} FPS · ${renderer.drawCalls} draws · ${renderer.triangleCount.toLocaleString()} triangles · ${debug.activeChunkCount} terrain chunks · ${physics.bodyCount} bodies`;
    frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);
  window.addEventListener('pagehide', () => { cancelAnimationFrame(frame); world.dispose(); physics.dispose(); scene.dispose(); coreModels.dispose(); renderer.dispose(); }, { once: true });
}
void review().catch(console.error);
