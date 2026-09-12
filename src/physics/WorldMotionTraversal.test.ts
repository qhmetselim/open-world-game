import { Scene } from 'three';
import { expect, it } from 'vitest';
import { defaultGameConfig as config } from '../core/Config';
import { World } from '../world/World';
import { CityLayoutGenerator } from '../city/CityLayoutGenerator';
import { NpcManager } from '../npc/NpcManager';
import { TrafficManager } from '../traffic/TrafficManager';
import { PhysicsWorld } from './PhysicsWorld';
import { rotationYaw } from './MotionHistory';
import { toRapierSteeringAngle } from '../vehicle/VehicleMovement';

it('physically drives 20 chunks and returns with terrain, city, NPC and traffic resources bounded', async () => {
  const physics = new PhysicsWorld(); await physics.initialize();
  const world = new World(config.world, config.city, config.building, config.player.spawnPosition, false);
  const layout = new CityLayoutGenerator(config.world.seed, config.city, (x, z) => world.getTerrainHeight(x, z)).generateRegion({ x: 0, z: 0 });
  const arterial = layout.segments.find((road) => road.type === 'arterial' && layout.nodes.find((node) => node.id === road.startNodeId)!.x === layout.nodes.find((node) => node.id === road.endNodeId)!.x)!;
  const roadCenterX = layout.nodes.find((node) => node.id === arterial.startNodeId)!.x;
  const laneOffset = config.city.mobility.laneWidth * 1.5;
  const x = roadCenterX + laneOffset;
  const scene = new Scene(); let focus = { x, z: 20 };
  const observer = { getWorldPosition: () => focus };
  world.initialize(scene, physics, observer);
  const baselineNetwork = JSON.stringify(world.getPedestrianNetworkAround(focus));
  const baselineBuildings = JSON.stringify(world.getBuildingsInRegion({ x: 0, z: 0 }));
  const sedan = config.vehicle.sedan;
  const car = physics.createVehicle([x, world.getTerrainHeight(x, 20) + 1.05, 20], 0, sedan);
  const traffic = new TrafficManager(scene, physics, config.traffic, sedan, config.world.seed, (px, pz) => world.getTerrainHeight(px, pz), (lane, px, pz) => world.isTrafficLaneLoaded(lane, px, pz));
  const npcs = new NpcManager(scene, config.npc, config.world.seed, (px, pz, surface) => world.getWalkableSurfaceHeight(px, pz, surface));
  const peak: Record<string, number> = {}; let final: Record<string, number> = {};
  let maximumZ = 20; let returned = false; let phase: 'forward' | 'brake' | 'reverse' = 'forward';
  let minimumClearance = Infinity;
  for (let tick = 0; tick < 90000; tick++) {
    const position = car.body.translation(); const velocity = car.body.linvel();
    const speed = Math.hypot(velocity.x, velocity.z); const yaw = rotationYaw(car.body.rotation());
    maximumZ = Math.max(maximumZ, position.z);
    if (phase === 'forward' && position.z >= 20 + config.world.chunkSize * 20) phase = 'brake';
    if (phase === 'brake' && speed < .15) phase = 'reverse';
    if (phase === 'reverse' && position.z <= 30) { returned = true; break; }
    const direction = phase === 'reverse' ? -1 : 1;
    // Closed-loop test driver writes forces/steering only: never body transforms or velocity.
    const targetX = roadCenterX + laneOffset * direction;
    const steering = Math.max(-.15, Math.min(.15, (targetX - position.x) * .04 - yaw * .9 * direction));
    let targetSpeed = direction === 1 ? 24 : 10;
    for (const other of traffic.getStates()) {
      if (other.tier !== 'active') continue;
      const ahead = (other.position.z - position.z) * direction;
      if (ahead > 0 && Math.abs(other.position.x - position.x) < 2.3) targetSpeed = Math.min(targetSpeed, Math.sqrt(6 * Math.max(0, ahead - 10)));
    }
    const braking = phase === 'brake' || speed > targetSpeed + .5;
    const force = braking ? 0 : direction * sedan.engineForce * Math.max(0, Math.min(1, targetSpeed - speed));
    for (let wheel = 0; wheel < 4; wheel++) {
      car.controller.setWheelEngineForce(wheel, wheel >= 2 ? force : 0);
      car.controller.setWheelBrake(wheel, braking ? sedan.brakeForce : 0);
      car.controller.setWheelSteering(wheel, wheel < 2 ? toRapierSteeringAngle(steering) : 0);
    }
    focus = { x: position.x, z: position.z + velocity.z * 1.5 };
    world.updateStreaming(observer);
    const network = world.getPedestrianNetworkAround(position);
    traffic.fixedUpdate(1 / 60, position, network, { ...position, speed });
    physics.updateVehicle(car, 1 / 60); physics.step(1 / 60); traffic.captureAfterStep();
    npcs.fixedUpdate(1 / 60, position, network);
    minimumClearance = Math.min(minimumClearance, position.y - world.getTerrainHeight(position.x, position.z));
    expect(Number.isFinite(position.y)).toBe(true); expect(position.y).toBeGreaterThan(world.getTerrainHeight(position.x, position.z) - .5);
    if (tick % 60 === 0) {
      const w = world.getDebugInfo(); const t = traffic.getDebugInfo(); const n = npcs.getDebugInfo();
      final = { chunks: w.activeChunkCount, roads: w.city.activeRoadChunkViewCount, buildings: w.city.activeBuildingChunkViewCount, buildingColliders: w.city.buildingColliderCount, lanes: w.city.activeLaneCount, nav: w.city.activePedestrianNodeCount, npc: n.activeCount, npcBackground: n.backgroundCount, traffic: t.activeCount, trafficBackground: t.backgroundCount, bodies: physics.bodyCount, colliders: physics.colliderCount, controllers: physics.vehicleControllerCount, sceneObjects: scene.children.length };
      for (const [key, value] of Object.entries(final)) peak[key] = Math.max(peak[key] ?? 0, value);
      expect(t.activeCount).toBeLessThanOrEqual(8); expect(n.activeCount).toBeLessThanOrEqual(20);
      expect(physics.vehicleControllerCount).toBe(t.activeCount + 1);
      expect(physics.bodyCount).toBe(w.activeChunkCount + w.city.buildingColliderCount + t.activeCount + 1);
      expect(w.activeChunkCount).toBeLessThanOrEqual(49);
    }
  }
  console.info('WORLD_MOTION_TRAVERSAL', { maximumZ, returned, minimumClearance, phase, position: car.body.translation(), velocity: car.body.linvel(), yaw: rotationYaw(car.body.rotation()), peak, final, traffic: traffic.getDebugInfo() });
  expect(maximumZ - 20).toBeGreaterThanOrEqual(config.world.chunkSize * 20); expect(returned).toBe(true);
  expect(peak.traffic).toBeGreaterThan(0); expect(peak.npc).toBeGreaterThan(0);
  expect(JSON.stringify(world.getPedestrianNetworkAround({ x, z: 20 }))).toBe(baselineNetwork);
  expect(JSON.stringify(world.getBuildingsInRegion({ x: 0, z: 0 }))).toBe(baselineBuildings);
  traffic.dispose(); npcs.dispose(); physics.removeVehicle(car); world.dispose();
  expect(physics.bodyCount).toBe(0); expect(physics.colliderCount).toBe(0); expect(physics.vehicleControllerCount).toBe(0); expect(scene.children).toHaveLength(0); physics.dispose();
}, 120_000);
