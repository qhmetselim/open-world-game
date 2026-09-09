import { describe, expect, it } from 'vitest';
import { Scene } from 'three';
import { defaultGameConfig } from '../core/Config';
import { InputManager } from '../input/InputManager';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { PlayerController } from './PlayerController';
import { World } from '../world/World';

function createKeyboardEvent(type: 'keydown' | 'keyup', code: string): KeyboardEvent {
  return Object.assign(new Event(type), { code }) as KeyboardEvent;
}

describe('PlayerController physics integration', () => {
  it('settles a kinematic capsule on the Rapier terrain collider and only jumps once grounded', async () => {
    const physics = new PhysicsWorld();
    await physics.initialize();
    physics.createStaticTerrainCollider([0, 0], 16, 1, new Float32Array([0, 0, 0, 0]));
    const inputTarget = new EventTarget();
    const input = new InputManager(inputTarget as unknown as Window);
    const player = new PlayerController({
      ...defaultGameConfig.player,
      spawnPosition: { x: 8, z: 8 }
    }, physics);
    const basis = { forward: { x: 0, z: -1 }, right: { x: 1, z: 0 } };
    player.initialize(() => 0);

    for (let frame = 0; frame < 30; frame += 1) {
      player.fixedUpdate(input, basis, 1 / 60, true, () => 0);
      physics.step(1 / 60);
    }

    expect(player.getState().grounded).toBe(true);
    const groundedHeight = player.getState().position.y;

    inputTarget.dispatchEvent(createKeyboardEvent('keydown', 'Space'));
    player.fixedUpdate(input, basis, 1 / 60, true, () => 0);
    physics.step(1 / 60);
    expect(player.getState().velocity.y).toBe(defaultGameConfig.player.jumpSpeed);
    expect(player.getState().position.y).toBeGreaterThan(groundedHeight);

    inputTarget.dispatchEvent(createKeyboardEvent('keyup', 'Space'));
    input.dispose();
    player.dispose();
    physics.dispose();
  });

  it('traverses streamed terrain chunks without losing its collider or unbounded physics bodies', async () => {
    const physics = new PhysicsWorld();
    await physics.initialize();
    const worldConfig = {
      ...defaultGameConfig.world,
      chunkSize: 16,
      terrainResolution: 4,
      activeChunkRadius: 1,
      unloadChunkRadius: 2
    };
    const playerConfig = {
      ...defaultGameConfig.player,
      spawnPosition: { x: 2, z: 2 },
      sprintSpeed: 18
    };
    const player = new PlayerController(playerConfig, physics);
    const world = new World(worldConfig, false);
    const scene = new Scene();
    const inputTarget = new EventTarget();
    const input = new InputManager(inputTarget as unknown as Window);
    const basis = { forward: { x: 0, z: -1 }, right: { x: 1, z: 0 } };

    world.initialize(scene, physics, player);
    player.initialize((x, z) => world.getTerrainHeight(x, z));
    inputTarget.dispatchEvent(createKeyboardEvent('keydown', 'KeyW'));
    inputTarget.dispatchEvent(createKeyboardEvent('keydown', 'ShiftLeft'));

    for (let frame = 0; frame < 800; frame += 1) {
      player.fixedUpdate(input, basis, 1 / 60, true, (x, z) => world.getTerrainHeight(x, z));
      physics.step(1 / 60);
      world.updateStreaming(player);
    }

    const debug = world.getDebugInfo();
    expect(player.getState().position.z).toBeLessThan(-100);
    expect(player.getState().position.y).toBeGreaterThan(playerConfig.killY);
    expect(debug.generatedChunkCount).toBeGreaterThan(9);
    expect(debug.chunkUnloadCount).toBeGreaterThan(0);
    expect(debug.activeChunkCount).toBeLessThanOrEqual((worldConfig.unloadChunkRadius * 2 + 1) ** 2);
    expect(physics.bodyCount).toBe(debug.activeChunkCount + 1);

    input.dispose();
    player.dispose();
    world.dispose();
    expect(physics.bodyCount).toBe(0);
    physics.dispose();
  });
});
