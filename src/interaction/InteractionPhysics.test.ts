import { Scene } from 'three';
import { describe, expect, it } from 'vitest';
import { defaultGameConfig as config } from '../core/Config';
import { InputManager } from '../input/InputManager';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { PlayerController } from '../player/PlayerController';
import { InteractionManager } from './InteractionManager';
import type { Interactable } from './InteractionState';

const door: Interactable = { id: 'door:test', ownerChunk: '0:0', type: 'door', enabled: true, radius: config.interaction.range,
  position: { x: 8, y: .02, z: 8 }, anchor: { x: 8, y: 1.27, z: 8 }, yaw: 0, actionLabel: 'Door' };
const basis = { forward: { x: 0, z: -1 }, right: { x: 1, z: 0 } };
const dt = config.physics.fixedTimeStep;

describe('actual Rapier world interactions', () => {
  it('blocks the real player at a closed leaf, then uses E to open and physically walk into the exterior vestibule', async () => {
    const physics = new PhysicsWorld(); await physics.initialize();
    physics.createStaticTerrainCollider([0, 0], 16, 1, new Float32Array(4));
    // Private building remains closed; only the exterior vestibule is accessible.
    physics.createStaticBox([8, 2, 5.8], [3, 2, .2]);
    const scene = new Scene(); const manager = new InteractionManager(scene, physics, config.interaction);
    manager.registerChunk('0:0', [door]);
    const target = new EventTarget(); const input = new InputManager(target as unknown as Window);
    const player = new PlayerController({ ...config.player, spawnPosition: { x: 8, z: 10 } }, physics); player.initialize(() => 0);
    const key = (type: string, code: string) => target.dispatchEvent(Object.assign(new Event(type), { code }));
    const step = (frames: number) => { for (let i = 0; i < frames; i++) {
      manager.fixedUpdate(dt); player.fixedUpdate(input, basis, dt, true, () => 0); physics.step(dt);
    } };
    key('keydown', 'KeyW'); step(90);
    expect(player.getState().position.z).toBeGreaterThan(8.35);
    expect(player.getState().position.z).toBeLessThan(8.7);
    expect(manager.updateFocus(player.getState().position, player.getState().facingYaw, player.getPhysicsBody(), true)).toBe(door.id);
    key('keydown', 'KeyE'); if (input.consumePressed('interact')) expect(manager.interactFocused()).toBe(true);
    step(120);
    expect(manager.getState(door.id)?.phase).toBe('open');
    expect(player.getState().position.z).toBeLessThan(7.5);
    expect(player.getState().position.z).toBeGreaterThan(6.3);
    expect(player.getState().grounded).toBe(true);
    key('keyup', 'KeyW');
    // Close from inside: LOS can see the anchor without the leaf masking its own interaction.
    expect(manager.updateFocus(player.getState().position, Math.PI, player.getPhysicsBody(), true)).toBe(door.id);
    manager.interactFocused(); step(90);
    expect(manager.getState(door.id)?.phase).toBe('closed');
    input.dispose(); player.dispose(); manager.dispose(); expect(scene.children).toHaveLength(0);
    expect(physics.bodyCount).toBe(2); physics.dispose();
  });

  it('rejects a wall-occluded target and vehicle context, preserves changed session state without duplicate bodies or stale focus', async () => {
    const physics = new PhysicsWorld(); await physics.initialize();
    physics.createStaticTerrainCollider([0, 0], 16, 1, new Float32Array(4));
    const scene = new Scene(); const manager = new InteractionManager(scene, physics, config.interaction);
    const toggle: Interactable = { ...door, type: 'toggle', id: 'toggle:test', position: { x: 10, y: 0, z: 8 }, anchor: { x: 10, y: 1, z: 8 } };
    manager.registerChunk('0:0', [door, toggle]); physics.step(dt);
    const count = physics.bodyCount; const objects = scene.children.length;
    manager.registerChunk('0:0', [door, toggle]); expect(physics.bodyCount).toBe(count);
    const from = { x: 8, y: 1.2, z: 10 };
    const wall = physics.createStaticBox([8, 1.2, 9], [1, 1.2, .15]); physics.step(dt);
    expect(manager.updateFocus(from, 0, undefined, true)).toBeUndefined();
    physics.removeRigidBody(wall); physics.step(dt);
    expect(manager.updateFocus(from, 0, undefined, false)).toBeUndefined();
    expect(manager.updateFocus(from, 0, undefined, true)).toBe(door.id);
    manager.interactFocused();
    for (let i = 0; i < 60; i++) { manager.fixedUpdate(dt); physics.step(dt); }
    expect(manager.updateFocus({ x: 10, y: 1, z: 10 }, 0, undefined, true)).toBe(toggle.id);
    manager.interactFocused(); expect(manager.getState(toggle.id)?.on).toBe(true);
    manager.unloadChunk('0:0');
    expect(manager.count).toBe(0); expect(manager.focusedId).toBeUndefined(); expect(manager.interactFocused()).toBe(false);
    expect(physics.bodyCount).toBe(1); expect(scene.children).toHaveLength(0);
    manager.registerChunk('0:0', [door, toggle]); physics.step(dt);
    expect(manager.getState(door.id)?.phase).toBe('open'); expect(manager.getState(toggle.id)?.on).toBe(true);
    expect(physics.bodyCount).toBe(count); expect(scene.children).toHaveLength(objects);
    manager.dispose(); expect(physics.bodyCount).toBe(1); physics.dispose();
  });

  it('does not close a leaf through an occupied player capsule', async () => {
    const physics = new PhysicsWorld(); await physics.initialize();
    const manager = new InteractionManager(new Scene(), physics, config.interaction);
    manager.registerChunk('0:0', [door]); physics.step(dt);
    manager.updateFocus({ x: 8, y: 1, z: 10 }, 0, undefined, true); manager.interactFocused();
    for (let i = 0; i < 60; i++) { manager.fixedUpdate(dt); physics.step(dt); }
    const character = physics.createKinematicCharacter([8, 1, 8], .5, .35, .02, .7);
    physics.step(dt);
    manager.updateFocus({ x: 8, y: 1, z: 10 }, 0, character.body, true); manager.interactFocused();
    for (let i = 0; i < 90; i++) { manager.fixedUpdate(dt); physics.step(dt); }
    expect(manager.getState(door.id)?.phase).toBe('open');
    manager.dispose(); physics.removeKinematicCharacter(character); expect(physics.bodyCount).toBe(0); physics.dispose();
  });
});
