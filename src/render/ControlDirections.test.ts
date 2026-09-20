import { afterEach, expect, it, vi } from 'vitest';
import { Scene, Vector3 } from 'three';
import { defaultGameConfig as config } from '../core/Config';
import { InputManager } from '../input/InputManager';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { PlayerController } from '../player/PlayerController';
import { createPlayerState } from '../player/PlayerState';
import { createVehicleState } from '../vehicle/VehicleState';
import { CameraManager } from './CameraManager';
import { PlayerView } from './PlayerView';
import { getCameraRelativeBasis } from './ThirdPersonCameraMath';

afterEach(() => vi.unstubAllGlobals());

it.each(['player', 'vehicle', 'development'] as const)('%s camera actual view turns right/left/up/down and survives F2', async (mode) => {
  const physics = new PhysicsWorld(); await physics.initialize(); physics.step(1/60);
  const windowTarget = Object.assign(new EventTarget(), { innerWidth: 1280, innerHeight: 720, performance });
  const canvas = new EventTarget();
  vi.stubGlobal('window', windowTarget);
  vi.stubGlobal('document', Object.assign(new EventTarget(), { pointerLockElement: canvas }));
  const input = new InputManager(windowTarget as unknown as Window); input.configurePointerLock(canvas as HTMLElement);
  const camera = new CameraManager(config.camera, config.vehicle.camera);
  const player = createPlayerState({ x: 0, y: 2, z: 0 });
  const vehicle = createVehicleState('car', { x: 0, y: 2, z: 0 }, .7);
  camera.initialize(player); if (mode === 'vehicle') camera.setVehicleChase(true);
  if (mode === 'development') camera.toggleMode();
  const settle = () => { for (let i=0;i<180;i++) camera.update(input,1/60,player,physics,undefined,mode === 'vehicle' ? vehicle : undefined); };
  settle();
  for (const [dx,dy] of [[20,0],[-20,0],[0,-20],[0,20]]) {
    const before = camera.camera.getWorldDirection(new Vector3());
    const right = before.clone().cross(new Vector3(0,1,0)).normalize();
    windowTarget.dispatchEvent(Object.assign(new Event('pointermove'), { movementX: dx, movementY: dy }));
    settle();
    const after = camera.camera.getWorldDirection(new Vector3());
    if (dx) expect(after.dot(right) * Math.sign(dx)).toBeGreaterThan(.01);
    if (dy) expect((after.y-before.y) * -Math.sign(dy)).toBeGreaterThan(.01);
  }
  const beforeSwitch = camera.camera.getWorldDirection(new Vector3());
  camera.toggleMode(); camera.toggleMode(); settle();
  expect(camera.camera.getWorldDirection(new Vector3()).dot(beforeSwitch)).toBeGreaterThan(.999);
  camera.dispose(); input.dispose(); physics.dispose();
});

it('walking, strafing, aiming and rendered body share the camera heading without an aim snap', async () => {
  const physics = new PhysicsWorld(); await physics.initialize(); physics.createStaticBox([0,-.5,0],[100,.5,100]); physics.step(1/60);
  const target = new EventTarget(), input = new InputManager(target as unknown as Window);
  const player = new PlayerController(config.player, physics); player.initialize(() => 0);
  const scene = new Scene(), view = new PlayerView(scene);
  const basis = getCameraRelativeBasis(Math.PI/2);
  target.dispatchEvent(Object.assign(new Event('keydown'), { code: 'KeyW' }));
  const start = { ...player.getState().position };
  for (let i=0;i<60;i++) { player.fixedUpdate(input,basis,1/60,true,()=>0); physics.step(1/60); }
  expect(player.getState().position.x).toBeGreaterThan(start.x+1);
  view.update(player.getState());
  expect(new Vector3(0,0,-1).applyQuaternion(scene.children[0]!.quaternion).dot(new Vector3(1,0,0))).toBeGreaterThan(.99);
  input.clearActionState(); target.dispatchEvent(Object.assign(new Event('keydown'), { code: 'KeyD' }));
  const before = player.getState().facingYaw;
  player.fixedUpdate(input,basis,1/60,true,()=>0,true); physics.step(1/60);
  expect(player.getState().facingYaw).toBeCloseTo(before);
  input.clearActionState();
  player.fixedUpdate(input,getCameraRelativeBasis(0),1/60,true,()=>0,true);
  expect(Math.abs(player.getState().facingYaw-before)).toBeLessThanOrEqual(config.player.rotationSpeed/60+.0001);
  view.dispose(scene); player.dispose(); input.dispose(); physics.dispose();
});
