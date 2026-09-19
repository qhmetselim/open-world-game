import { Scene } from 'three';
import { expect, it, vi } from 'vitest';
import { defaultGameConfig as config } from '../core/Config';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { TrafficManager } from '../traffic/TrafficManager';
import { VehicleManager } from './VehicleManager';
import { InputManager } from '../input/InputManager';
import { createVehicleState } from './VehicleState';
import { getVehicleExitCandidates, findSafeExitCandidate, isVehicleEnterEligible } from './VehicleInteraction';
import type { UrbanMobilityNetwork, VehicleLane } from '../city/UrbanMobility';

const lane = (id: string, x: number): VehicleLane => ({ id, roadId: id, direction: 'forward', laneIndex: 0, roadClass: 'local',
  speedMetadata: 30, startNodeId: `${id}:a`, endNodeId: `${id}:b`, path: [{ x, z: 40 }, { x, z: 190 }] });
const network: UrbanMobilityNetwork = { lanes: [lane('a', 0), lane('b', 12)], intersections: [], laneConnections: [], pedestrianNodes: [], pedestrianConnections: [], crossings: [] };

it('rejects fast, occupied, distant or vertically inaccessible vehicles', () => {
  const state = createVehicleState('car', { x: 0, y: 1, z: 0 }, 0);
  expect(isVehicleEnterEligible({ x: 2, z: 0 }, state, 5, 1.2)).toBe(true);
  state.speed = 1.21; expect(isVehicleEnterEligible({ x: 2, z: 0 }, state, 5, 1.2)).toBe(false);
  state.speed = 0; state.occupied = true; expect(isVehicleEnterEligible({ x: 2, z: 0 }, state, 5, 1.2)).toBe(false);
  state.occupied = false; expect(isVehicleEnterEligible({ x: 2, y: 10, z: 0 }, state, 5, 1.2)).toBe(false);
  expect(isVehicleEnterEligible({ x: 8, z: 0 }, state, 5, 1.2)).toBe(false);
});

it('transfers two actual AI chassis without respawn, drives/exits/parks, survives AI streaming, and cleans every resource', async () => {
  const physics = new PhysicsWorld(); await physics.initialize(); const scene = new Scene();
  physics.createStaticBox([0,-.5,100], [300,.5,300]); physics.step(1/60);
  const create = vi.spyOn(physics, 'createVehicle');
  const traffic = new TrafficManager(scene, physics, { ...config.traffic, maxActive: 2, maxBackground: 2, activationBudget: 2 }, config.vehicle.sedan, 'takeover', () => 0);
  const manager = new VehicleManager();
  const target = new EventTarget(); const input = new InputManager(target as unknown as Window);
  const key = (type: string, code: string) => target.dispatchEvent(Object.assign(new Event(type), { code }));
  const tick = () => { physics.step(1/60); traffic.captureAfterStep(); for (const vehicle of manager.getAll()) vehicle.syncFromPhysics(); };
  for (let i=0; i<8; i++) { traffic.fixedUpdate(1/60, { x: 0,z: 0 }, network, undefined); tick(); }
  const states = traffic.getStates().filter((s) => s.tier === 'active'); expect(states).toHaveLength(2);
  const firstState = states[0]!, secondState = states[1]!;
  const bodies = physics.bodyCount, controllers = physics.vehicleControllerCount, objects = scene.children.length;
  const first = traffic.takeOver(firstState.id, firstState.position, config.vehicle, manager)!;
  expect(first).toBeDefined(); expect(create).toHaveBeenCalledTimes(2);
  expect(create.mock.results.some((result) => result.value.body === first.getBody())).toBe(true);
  expect(physics.bodyCount).toBe(bodies); expect(physics.vehicleControllerCount).toBe(controllers); expect(scene.children.length).toBe(objects);
  expect(traffic.takeOver(firstState.id, firstState.position, config.vehicle, manager)).toBeUndefined();
  first.setOccupied(true); const start = { ...first.getState().position };
  key('keydown','KeyW'); key('keydown','KeyD');
  for (let i=0; i<90; i++) {
    first.fixedUpdate(input,1/60);
    traffic.fixedUpdate(1/60,{x:0,z:0},network,manager.getAll().map((v)=>({...v.getState().position,speed:v.getState().speed})));
    tick(); manager.render(.5);
  }
  expect(first.getState().position.z).toBeGreaterThan(start.z + 1);
  expect(first.getState().yaw).toBeGreaterThan(.01); expect(first.getState().steering).toBeGreaterThan(0);
  key('keyup','KeyW'); key('keyup','KeyD'); key('keydown','Space');
  for(let i=0;i<180;i++){ first.fixedUpdate(input,1/60); tick(); }
  expect(first.getState().speed).toBeLessThan(config.vehicle.interaction.maxExitSpeed);
  const exit = findSafeExitCandidate(getVehicleExitCandidates(first.getState(),config.vehicle), (p) => physics.isCapsulePositionClear([p.x,1.03,p.z],.6,.4,first.getBody()));
  expect(exit).toBeDefined(); first.setOccupied(false); input.clearActionState();
  expect(first.getState().control).toBe('parked');
  // Second car may have accelerated under AI; entry must fail until it has actually stopped.
  const secondLive = traffic.getStates().find((s)=>s.id === secondState.id)!;
  if (secondLive.speed > config.vehicle.interaction.maxEnterSpeed) expect(traffic.takeOver(secondLive.id, secondLive.position, config.vehicle, manager)).toBeUndefined();
  // A parked external obstacle ahead makes the real AI brake, not a transform/velocity reset.
  const blocker = { x: secondLive.position.x, z: secondLive.position.z + 9, speed: 0 };
  for(let i=0;i<300;i++){ first.idleFixedUpdate(1/60); traffic.fixedUpdate(1/60,{x:0,z:0},network,[{...first.getState().position,speed:first.getState().speed},blocker]); tick(); }
  expect(secondLive.speed).toBeLessThan(config.vehicle.interaction.maxEnterSpeed);
  const second = traffic.takeOver(secondLive.id,secondLive.position,config.vehicle,manager)!;
  expect(second).toBeDefined(); second.setOccupied(true); expect(manager.count).toBe(2);
  const parked = { ...first.getState().position }; const handle = second.getBody()!.handle;
  // AI receives no lane network at a distant focus: managed vehicles must not be tiered/recycled.
  const empty = { ...network, lanes: [] };
  manager.setSimulationEnabled(first,false);
  for(let i=0;i<120;i++){ second.idleFixedUpdate(1/60); traffic.fixedUpdate(1/60,{x:5000,z:5000},empty,undefined); tick(); }
  expect(first.getState().position).toEqual(parked); expect(second.getBody()!.handle).toBe(handle);
  manager.setSimulationEnabled(first,true); first.setOccupied(true); expect(first.getState().control).toBe('player');
  traffic.fixedUpdate(1/60,{x:0,z:0},network,undefined);
  expect(traffic.getStates().some((s)=>s.id===firstState.id || s.id===secondState.id)).toBe(false);
  expect(create).toHaveBeenCalledTimes(2);
  input.dispose(); manager.dispose(); traffic.dispose(); expect(physics.bodyCount).toBe(1);
  expect(physics.vehicleControllerCount).toBe(0); expect(scene.children).toHaveLength(0); physics.dispose();
});
