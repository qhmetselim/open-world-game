import { Scene } from 'three';
import { expect, it } from 'vitest';
import { defaultGameConfig as config } from '../core/Config';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { World } from '../world/World';
import { InteractionManager } from './InteractionManager';
import { WorldInteractions } from './WorldInteractions';
import { createEntranceDoor } from './InteractionPlacement';

it('streams deterministic validated building entrances with bounded registrations and physics, preserving world ownership on reload', async () => {
  const scene = new Scene(); const physics = new PhysicsWorld(); await physics.initialize();
  const focus = { x: 12, z: 12 }; const observer = { getWorldPosition: () => focus };
  const world = new World(config.world, config.city, config.building, config.player.spawnPosition, false);
  world.initialize(scene, physics, observer);
  const interactions = new InteractionManager(scene, physics, config.interaction);
  const streaming = new WorldInteractions(world, interactions, config.interaction, config.world.chunkSize, config.player.spawnPosition);
  streaming.sync();
  const initial = interactions.getActiveItems();
  const doors = initial.filter((item) => item.type === 'door');
  expect(doors.length).toBeGreaterThan(0);
  expect(initial.filter((item) => item.type === 'toggle')).toHaveLength(1);
  const bodies = physics.bodyCount; streaming.sync(); expect(physics.bodyCount).toBe(bodies);
  for (const door of doors) {
    expect(world.isOutsideStreet(door.position.x, door.position.z)).toBe(true);
    expect(door.position.y - world.getTerrainHeight(door.position.x, door.position.z)).toBeLessThanOrEqual(config.interaction.maximumGroundVariation + config.interaction.foundationPadding + 1e-6);
  }
  const building = world.getLoadedBuildingChunks().flatMap((chunk) => chunk.buildings)[0]!;
  expect(createEntranceDoor(building, '0:0', config.interaction, () => 0, () => false)).toBeUndefined();
  expect(createEntranceDoor(building, '0:0', config.interaction, (x) => x * 10, () => true)).toBeUndefined();
  for (const x of [128 * 5, -128 * 5, 12]) {
    focus.x = x; world.updateStreaming(observer); streaming.sync(); physics.step(config.physics.fixedTimeStep);
    expect(interactions.count).toBeLessThanOrEqual(world.getLoadedBuildingChunks().length + 1);
    const debug = world.getDebugInfo();
    const current = interactions.getActiveItems();
    expect(physics.bodyCount).toBe(debug.activeChunkCount + debug.city.buildingColliderCount + current.reduce((sum, item) => sum + (item.type === 'door' ? 5 : 1), 0));
  }
  for (const item of initial) expect(interactions.getActiveItems().find((candidate) => candidate.id === item.id)).toEqual(item);
  interactions.dispose(); world.dispose(); expect(physics.bodyCount).toBe(0); expect(scene.children).toHaveLength(0); physics.dispose();
});
