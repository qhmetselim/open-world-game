import { Scene } from 'three';
import { expect, it } from 'vitest';
import { defaultGameConfig as config } from '../core/Config';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { World } from '../world/World';
import { selectInterior, distanceToInterior } from './InteriorLayout';
import { InteractionManager } from '../interaction/InteractionManager';
import { WorldInteractions } from '../interaction/WorldInteractions';
import { PlayerController } from '../player/PlayerController';
import { InputManager } from '../input/InputManager';

it('streams deterministic interiors without retaining resources after chunk removal', async () => {
  const scene = new Scene(); const physics = new PhysicsWorld(); await physics.initialize();
  const focus = { x: 12, z: 12 }; const observer = { getWorldPosition: () => focus };
  const world = new World(config.world, config.city, config.building, config.player.spawnPosition, false);
  world.initialize(scene, physics, observer);
  const initial = world.getInteriorLayouts(); expect(initial.length).toBeGreaterThan(0);
  const layout = initial[0]!;
  const interaction = new InteractionManager(scene, physics, config.interaction);
  const streaming = new WorldInteractions(world, interaction, config.interaction, config.world.chunkSize, config.player.spawnPosition);
  streaming.sync();
  const before = physics.bodyCount;
  world.updateInteriors(layout.door.position); expect(world.activeInteriorCount).toBeGreaterThan(0);
  const active = physics.bodyCount; const objects = scene.children.length;
  world.updateInteriors(layout.door.position); streaming.sync();
  expect(physics.bodyCount).toBe(active); expect(scene.children.length).toBe(objects);
  expect(active).toBe(before + world.activeInteriorCount);
  const floor = layout.building.baseElevation;
  expect(distanceToInterior(layout, layout.building)).toBe(0);
  for (const box of layout.rooms) {
    expect(Math.abs(box.x) + box.width / 2).toBeLessThanOrEqual(layout.building.width / 2);
    expect(Math.abs(box.z) + box.depth / 2).toBeLessThanOrEqual(layout.building.depth / 2);
    expect(box.height).toBe(config.building.floorHeight);
  }
  const chunk = world.getLoadedBuildingChunks().find((c) => c.key === layout.door.ownerChunk)!;
  expect(selectInterior([...chunk.buildings].reverse(), chunk.key, config.interaction, config.building.floorHeight,
    (x,z) => world.getTerrainHeight(x,z), (x,z) => world.isOutsideStreet(x,z))).toEqual(layout);
  expect(selectInterior(chunk.buildings, chunk.key, config.interaction, config.building.floorHeight, () => floor + 10, () => true)).toBeUndefined();
  focus.x += 128 * 6; world.updateStreaming(observer); streaming.sync(); world.updateInteriors(focus);
  expect(interaction.getActiveItems().some((item) => item.id === layout.door.id)).toBe(false);
  expect(world.getInteriorLayouts().some((item) => item.building.id === layout.building.id)).toBe(false);
  focus.x = 12; world.updateStreaming(observer); streaming.sync(); world.updateInteriors(layout.door.position);
  expect(world.getInteriorLayouts().find((item) => item.building.id === layout.building.id)).toEqual(layout);
  expect(new Set(interaction.getActiveItems().map((item) => item.id)).size).toBe(interaction.count);
  interaction.dispose(); world.dispose(); expect(physics.bodyCount).toBe(0); expect(physics.colliderCount).toBe(0);
  expect(scene.children).toHaveLength(0); physics.dispose();
});

it('walks through an actual procedural entrance into rooms using Rapier, blocks walls, and walks back outside', async () => {
  const scene = new Scene(); const physics = new PhysicsWorld(); await physics.initialize();
  const world = new World(config.world, config.city, config.building, config.player.spawnPosition, false);
  world.initialize(scene, physics, { getWorldPosition: () => config.player.spawnPosition });
  const layout = world.getInteriorLayouts()[0]!, door = layout.door;
  const nx = Math.sin(door.yaw), nz = Math.cos(door.yaw);
  const terrain = (x: number, z: number) => world.getTerrainHeight(x,z);
  const player = new PlayerController({ ...config.player, spawnPosition: { x: door.position.x + nx * 2, z: door.position.z + nz * 2 } }, physics);
  player.initialize(terrain); world.updateInteriors(player.getWorldPosition());
  const manager = new InteractionManager(scene, physics, config.interaction); manager.registerChunk(door.ownerChunk, [door]);
  const target = new EventTarget(); const input = new InputManager(target as unknown as Window);
  const key = (type: string, code: string) => target.dispatchEvent(Object.assign(new Event(type), { code }));
  const basis = { forward: { x: -nx, z: -nz }, right: { x: nz, z: -nx } };
  const dt = config.physics.fixedTimeStep;
  const step = (frames: number) => { for (let i=0; i<frames; i++) {
    manager.fixedUpdate(dt); player.fixedUpdate(input, basis, dt, true, terrain); physics.step(dt);
  } };
  const inward = () => -(player.getState().position.x - door.position.x) * nx - (player.getState().position.z - door.position.z) * nz;
  key('keydown','KeyW'); step(90); expect(inward()).toBeLessThan(0);
  manager.updateFocus(player.getState().position, -door.yaw, player.getPhysicsBody(), true);
  expect(manager.interactFocused()).toBe(true); step(110); key('keyup','KeyW'); step(30);
  expect(inward()).toBeGreaterThan(5); expect(player.getState().grounded).toBe(true);
  expect(player.getState().position.y).toBeCloseTo(layout.building.baseElevation + 1 + config.player.controllerOffset, 1);
  // Lateral motion meets the corridor's solid partition, not an imaginary whole-building volume.
  key('keydown','KeyD'); step(90); key('keyup','KeyD'); step(30);
  const dx = player.getState().position.x - door.position.x, dz = player.getState().position.z - door.position.z;
  expect(Math.abs(dx * nz - dz * nx)).toBeLessThan(1.3);
  key('keydown','KeyA'); step(10); key('keyup','KeyA'); step(25);
  key('keydown','KeyS'); step(160); key('keyup','KeyS'); step(30);
  expect(inward()).toBeLessThan(-1); expect(player.getState().grounded).toBe(true);
  input.dispose(); player.dispose(); manager.dispose(); world.dispose(); expect(physics.bodyCount).toBe(0); physics.dispose();
});
