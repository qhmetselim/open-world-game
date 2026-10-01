/** Development-only inspection entry, excluded from the production entry graph.
 * Uses the real view adapters; no game state, AI or physics changes. */
import { Color, DirectionalLight, HemisphereLight, Mesh, MeshStandardMaterial, PerspectiveCamera, PlaneGeometry, Scene } from 'three';
import { defaultGameConfig } from '../core/Config';
import { Renderer } from './Renderer';
import { coreModels } from './loaders/CoreModels';
import { VehicleView } from './VehicleView';
import { TrafficSignalView } from './TrafficSignalView';
import { createVehicleState } from '../vehicle/VehicleState';

async function review(): Promise<void> {
  if (!import.meta.env.DEV) return;
  await coreModels.initialize();
  const scene = new Scene(); scene.background = new Color(0x9db2bb);
  scene.add(new HemisphereLight(0xd7e8ed, 0x6d7062, 2));
  const sun = new DirectionalLight(0xfff1da, 3); sun.position.set(3, 7, 4); scene.add(sun);
  sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024); sun.shadow.normalBias = .02;
  Object.assign(sun.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8, near: .1, far: 30 });
  const floor = new Mesh(new PlaneGeometry(200, 200), new MeshStandardMaterial({ color: 0x738780, roughness: .95 }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
  const renderer = new Renderer(document.body, defaultGameConfig.rendering);
  const camera = new PerspectiveCamera(40, innerWidth / innerHeight, .01, 200);
  let vehicle: VehicleView | undefined, signal: TrafficSignalView | undefined;
  const family: VehicleView[] = [];
  let kind = 'sedan', rear = false, moving = false, phase = 0, previous = performance.now();
  const objects: Mesh[] = []; const roots: ReturnType<typeof coreModels.create>[] = [];
  const state = createVehicleState('asset-review', { x: 0, y: .97876, z: 0 }, 0);
  state.suspensionLengths = [.29376, .29376, .29376, .29376]; state.wheelContactCount = 4;
  const show = (next: string) => {
    vehicle?.dispose(); vehicle = undefined; signal?.dispose(scene); signal = undefined;
    family.forEach(view => view.dispose()); family.length = 0;
    roots.forEach(root => root?.removeFromParent()); roots.length = 0;
    objects.forEach(object => scene.remove(object)); objects.length = 0;
    kind = next;
    if (next === 'family') {
      for (const [index, model] of (['hatchback', 'sedan', 'crossover', 'police'] as const).entries()) {
        const view = new VehicleView(scene, defaultGameConfig.vehicle.sedan, model);
        view.update({ ...state, position: { ...state.position, x: (index - 1.5) * 3.3 } }); family.push(view);
      }
    } else if (next === 'sedan' || next === 'police' || next === 'hatchback' || next === 'crossover') {
      vehicle = new VehicleView(scene, defaultGameConfig.vehicle.sedan, next); vehicle.update(state);
    } else if (next === 'pistol') {
      const root = coreModels.create('pistol'); root!.position.y = .3; scene.add(root!); roots.push(root);
    } else {
      for (const [key, x] of [['streetLampTest', -3], ['bench', 0], ['bin', 1.8]] as const) {
        const geometry = coreModels.geometry(key)!;
        const mesh = new Mesh(geometry, streetMaterial); mesh.position.x = x; scene.add(mesh); objects.push(mesh);
      }
      signal = new TrafficSignalView(scene, defaultGameConfig.traffic.rules, () => 0);
      signal.sync([{ id: 'review', intersectionId: 'review', laneIds: [], phaseIndex: 0, phaseCount: 2, phaseOffset: 0, yaw: Math.PI, position: { x: 3.2, z: 0 } }], new Map());
      signal.update(['red']);
    }
  };
  const streetMaterial = new MeshStandardMaterial({ vertexColors: true, roughness: .9 });
  document.querySelectorAll<HTMLButtonElement>('[data-model]').forEach(button => button.addEventListener('click', () => show(button.dataset.model!)));
  document.querySelector('#steer')!.addEventListener('click', () => { moving = !moving; });
  document.querySelector('#rear')!.addEventListener('click', () => { rear = !rear; });
  document.querySelector('#signal')!.addEventListener('click', () => { phase++; signal?.update([(['red', 'yellow', 'green'] as const)[phase % 3]!]); });
  show('sedan');
  const frame = (time: number) => {
    const dt = Math.min((time - previous) / 1000, .05); previous = time;
    if (moving) { state.steering = Math.sin(time / 600) * .48; const spin = state.wheelRotations[0] + dt * 3; state.wheelRotations = [spin, spin, spin, spin]; }
    vehicle?.update(state);
    family.forEach((view, index) => view.update({ ...state, position: { ...state.position, x: (index - 1.5) * 3.3 } }));
    const small = kind === 'pistol'; const wide = kind === 'street';
    camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
    camera.position.set(small ? .55 : wide ? 8 : 4.5, small ? .55 : wide ? 5 : 2.7, (small ? -.7 : wide ? 9 : 6) * (rear ? -1 : 1));
    camera.lookAt(0, small ? .23 : wide ? 2 : 1, small ? .13 : 0);
    if (kind === 'family') { camera.position.set(10, 9, rear ? -18 : 18); camera.lookAt(0, .9, 0); }
    renderer.render(scene, camera);
    document.querySelector('#status')!.textContent = `${kind} · ${renderer.drawCalls} draws · ${renderer.triangleCount.toLocaleString()} triangles · actual runtime view/materials`;
  };
  let animation = 0;
  const tick = (time: number) => { frame(time); animation = requestAnimationFrame(tick); }; animation = requestAnimationFrame(tick);
  window.addEventListener('pagehide', () => {
    cancelAnimationFrame(animation); vehicle?.dispose(); family.forEach(view => view.dispose()); signal?.dispose(scene);
    floor.geometry.dispose(); floor.material.dispose(); streetMaterial.dispose(); coreModels.dispose(); renderer.dispose();
  }, { once: true });
}
void review().catch(console.error);
