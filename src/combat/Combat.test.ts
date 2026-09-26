import { afterEach, expect, it, vi } from 'vitest';
import { Scene } from 'three';
import { combatConfig } from './CombatConfig';
import { beginReload, consumeShot, createCombatState, stepWeapon } from './CombatState';
import { applyDamage, createHealth } from './Health';
import { CombatController } from './CombatController';
import type { CombatEvent, CombatCommand } from './CombatController';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { NpcManager } from '../npc/NpcManager';
import { defaultGameConfig } from '../core/Config';
import type { UrbanMobilityNetwork } from '../city/UrbanMobility';
import { InputManager } from '../input/InputManager';
import { CameraManager } from '../render/CameraManager';
import { createPlayerState } from '../player/PlayerState';

afterEach(() => vi.unstubAllGlobals());
const weapon = combatConfig.pistol;
const network: UrbanMobilityNetwork = { lanes: [], intersections: [], crossings: [], laneConnections: [], pedestrianConnections: [],
  pedestrianNodes: [{ id: 'target', position: { x: 0, z: -10 }, side: 'left', roadId: 'r', connectionIds: [] }] };
const command: CombatCommand = { allowed: true, locked: true, equip: false, aim: true, fire: true, reload: false };

it('enforces fire cadence, finite magazine/reserve and timed reload without creating ammo', () => {
  const state = createCombatState(weapon);
  expect(consumeShot(state, weapon)).toBe(false);
  state.equipped = true; state.aiming = true;
  for (let i = 0; i < weapon.magazineSize; i++) {
    expect(consumeShot(state, weapon)).toBe(true);
    expect(consumeShot(state, weapon)).toBe(false);
    stepWeapon(state, weapon, 1 / weapon.fireRate);
  }
  expect(consumeShot(state, weapon)).toBe(false);
  state.reserve = 3;
  expect(beginReload(state, weapon)).toBe(true);
  expect(beginReload(state, weapon)).toBe(false);
  stepWeapon(state, weapon, .7); expect(state.magazine).toBe(0);
  expect(consumeShot(state, weapon)).toBe(false);
  stepWeapon(state, weapon, .8); expect(state.magazine).toBe(3); expect(state.reserve).toBe(0);
  expect(beginReload(state, weapon)).toBe(false);
  expect(JSON.parse(JSON.stringify(state))).toEqual(state);
});

it('shares clamped health/damage semantics without healing or duplicate death damage', () => {
  const health = createHealth();
  expect(applyDamage(health, -5)).toBe(0); expect(applyDamage(health, NaN)).toBe(0);
  expect(applyDamage(health, 34)).toBe(34); expect(health.current).toBe(66);
  expect(applyDamage(health, 1000)).toBe(66); expect(applyDamage(health, 1)).toBe(0);
});

it('moves aim camera smoothly over the shoulder and restores normal framing without changing movement basis', async () => {
  const physics = new PhysicsWorld(); await physics.initialize(); physics.step(1/60);
  const target = Object.assign(new EventTarget(), { innerWidth: 1280, innerHeight: 720, performance }); vi.stubGlobal('window', target);
  const input = new InputManager(target as unknown as Window), player = createPlayerState({ x: 0, y: 1, z: 0 });
  const camera = new CameraManager(defaultGameConfig.camera, defaultGameConfig.vehicle.camera); camera.initialize(player);
  const basis = camera.getMovementBasis(), originalX = camera.camera.position.x;
  for (let i=0; i<180; i++) {
    const previous = camera.camera.position.clone();
    camera.update(input, 1/60, player, physics, undefined, undefined, true);
    expect(camera.camera.position.distanceTo(previous)).toBeLessThan(.15);
  }
  expect(camera.camera.position.x - originalX).toBeCloseTo(combatConfig.aimShoulderOffset, 3);
  expect(camera.getMovementBasis()).toEqual(basis);
  for (let i=0; i<180; i++) camera.update(input, 1/60, player, physics, undefined, undefined, false);
  expect(camera.camera.position.x).toBeCloseTo(originalX, 3);
  camera.dispose(); input.dispose(); physics.dispose();
});

it('gates semantic mouse actions on pointer lock and clears them on lock loss; E/R/W remain independent', () => {
  const documentTarget = new EventTarget() as EventTarget & { pointerLockElement: unknown };
  documentTarget.pointerLockElement = null; vi.stubGlobal('document', documentTarget);
  const target = new EventTarget(), canvas = new EventTarget();
  const input = new InputManager(target as unknown as Window); input.configurePointerLock(canvas as HTMLElement);
  const pointer = (type: string, button: number) => target.dispatchEvent(Object.assign(new Event(type), { button }));
  pointer('mousedown', 0); expect(input.consumePressed('fire')).toBe(false);
  documentTarget.pointerLockElement = canvas;
  pointer('mousedown', 2); pointer('mousedown', 0);
  expect(input.isActive('aim')).toBe(true); expect(input.consumePressed('fire')).toBe(true); expect(input.consumePressed('fire')).toBe(false);
  for (const code of ['KeyQ', 'KeyR', 'KeyE', 'KeyW']) target.dispatchEvent(Object.assign(new Event('keydown'), { code }));
  expect(input.consumePressed('toggleWeapon')).toBe(true); expect(input.consumePressed('resetVehicle')).toBe(true);
  expect(input.consumePressed('interact')).toBe(true); expect(input.isActive('moveForward')).toBe(true);
  documentTarget.pointerLockElement = null; documentTarget.dispatchEvent(new Event('pointerlockchange'));
  expect(input.isActive('aim')).toBe(false); expect(input.isActive('fire')).toBe(false); input.dispose();
});

it('browser RMB/LMB chord event sequence reaches combat exactly once and release preserves aim', async () => {
  const physics = new PhysicsWorld(); await physics.initialize(); physics.step(1/60);
  const npcs = new NpcManager(new Scene(), defaultGameConfig.npc, 'input-chord', () => 0);
  const combat = new CombatController(physics,npcs);
  const canvas = new EventTarget(), target = new EventTarget();
  const documentTarget = Object.assign(new EventTarget(), { pointerLockElement: canvas as EventTarget | null });
  vi.stubGlobal('document',documentTarget);
  const input = new InputManager(target as unknown as Window); input.configurePointerLock(canvas as HTMLElement);
  const mouse = (type: string, button: number, buttons: number) => target.dispatchEvent(Object.assign(new Event(type),{button,buttons,movementX:0,movementY:0}));
  const tick = () => combat.step(.3, { allowed:true,locked:input.isPointerLocked,equip:input.consumePressed('toggleWeapon'),
    aim:input.isActive('aim'),fire:input.consumePressed('fire'),reload:false },
    {x:0,y:1,z:0},{x:0,y:2,z:4},{x:0,y:0,z:-1},undefined);
  target.dispatchEvent(Object.assign(new Event('keydown'),{code:'KeyQ'})); tick();
  // Browser mouse chord: only first button generates pointerdown.
  mouse('pointerdown',2,2); mouse('mousedown',2,2); tick();
  mouse('pointermove',0,3); mouse('mousedown',0,3); tick();
  expect(combat.state.shotsFired).toBe(1); expect(combat.state.magazine).toBe(weapon.magazineSize-1);
  tick(); expect(combat.state.shotsFired).toBe(1);
  mouse('mouseup',0,2); expect(input.isActive('aim')).toBe(true); expect(input.isActive('fire')).toBe(false);
  mouse('mousedown',0,3); tick(); expect(combat.state.shotsFired).toBe(2);
  documentTarget.pointerLockElement=null; documentTarget.dispatchEvent(new Event('pointerlockchange'));
  mouse('mousedown',0,1); tick(); expect(combat.state.shotsFired).toBe(2);
  input.dispose(); combat.dispose(); npcs.dispose(); physics.dispose();
});

it('real Rapier blocks shots with cover, excludes self, damages/kills an NPC and retains death after streaming', async () => {
  const physics = new PhysicsWorld(); await physics.initialize();
  const scene = new Scene(), npcs = new NpcManager(scene, defaultGameConfig.npc, 'combat', () => 0);
  const focus = { x: 0, z: 0 }; npcs.fixedUpdate(1/60, focus, network);
  const target = npcs.getNearestNpc(focus, 20)!;
  const player = physics.createKinematicCharacter([0, 1, 0], .6, .4, .03, .6);
  const wall = physics.createStaticBox([0, 1, -5], [2, 2, .3]); physics.step(1/60);
  const combat = new CombatController(physics, npcs), events: CombatEvent[] = [];
  const unsubscribe = combat.subscribe((event) => events.push(event));
  const shoot = (extra: Partial<CombatCommand> = {}) => combat.step(.3, { ...command, ...extra }, { x: 0, y: 1, z: 0 }, { x: 0, y: 1.1, z: 4 }, { x: 0, y: 0, z: -1 }, player.body);
  shoot({ equip: true }); expect(target.health.current).toBe(100); expect(combat.lastHit).toBe('world');
  physics.removeRigidBody(wall); physics.step(1/60);
  const count = physics.colliderCount;
  shoot(); expect(target.health.current).toBe(66); shoot(); shoot();
  expect(combat.lastShot?.hit).toBe('npc');
  expect(combat.lastShot?.to.z).toBeGreaterThan(target.position.z);
  expect(combat.lastShot?.to.z).toBeLessThan(target.position.z+1);
  expect(target.health.current).toBe(0); expect(target.activity).toBe('dead');
  expect(events.filter((e) => e.type === 'npcKilled')).toHaveLength(1);
  expect(events.find(e=>e.type==='npcKilled')).toMatchObject({position:target.position});
  expect(events.filter((e) => e.type === 'npcDamaged')).toHaveLength(3);
  const position = { ...target.position };
  for (let i=0; i<180; i++) npcs.fixedUpdate(1/60, focus, network);
  expect(target.position).toEqual(position); npcs.render(.016); shoot();
  expect(events.filter((e) => e.type === 'npcKilled')).toHaveLength(1);
  expect(physics.colliderCount).toBe(count); // NPC hit shapes create no world bodies/colliders.
  npcs.fixedUpdate(.1, { x: 5000, z: 5000 }, network); npcs.fixedUpdate(.1, focus, network);
  expect(npcs.getNearestNpc(focus, 20)!.health.current).toBe(0);
  unsubscribe(); combat.dispose(); npcs.dispose(); expect(scene.children).toHaveLength(0);
  physics.removeKinematicCharacter(player); expect(physics.bodyCount).toBe(0); physics.dispose();
});

it('rejects vehicle/development/unlocked fire, cancels reload on holster, and respects range and muzzle cover', async () => {
  const physics = new PhysicsWorld(); await physics.initialize(); const scene = new Scene();
  const npcs = new NpcManager(scene, defaultGameConfig.npc, 'combat', () => 0); npcs.fixedUpdate(.01, { x: 0, z: 0 }, network);
  const combat = new CombatController(physics, npcs); physics.step(.016);
  const p = { x: 0, y: 1, z: 0 }, eye = { x: 0, y: 1, z: 4 }, d = { x: 0, y: 0, z: -1 };
  combat.step(.3, { ...command, equip: true, locked: false }, p, eye, d); expect(combat.state.magazine).toBe(12);
  combat.step(.3, command, p, eye, d); expect(combat.state.magazine).toBe(11);
  combat.step(.1, { ...command, fire: false, reload: true }, p, eye, d); expect(combat.state.reloadRemaining).toBeGreaterThan(0);
  combat.step(2, { ...command, allowed: false }, p, eye, d);
  expect(combat.state.equipped).toBe(false); expect(combat.state.reloadRemaining).toBe(0); expect(combat.state.magazine).toBe(11);
  const targets = npcs.getNearbyActive(p, 90);
  expect(physics.castCombatRay(p, d, 2, targets)).toBeUndefined();
  // Tiny cover between chest and muzzle, not between camera and distant target.
  const cover = physics.createStaticBox([.22, 1.4, -.36], [.1, .2, .1]); physics.step(.016);
  const health = targets[0]!.health.current;
  combat.step(.3, { ...command, equip: true }, p, eye, d);
  expect(targets[0]!.health.current).toBe(health); expect(combat.lastHit).toBe('world');
  physics.removeRigidBody(cover); physics.step(.016);
  targets[0]!.position.z = 2; // Visible between third-person camera and the player's back.
  combat.step(.3, command, p, eye, d);
  expect(targets[0]!.health.current).toBe(health);
  combat.dispose(); npcs.dispose(); physics.dispose();
});
