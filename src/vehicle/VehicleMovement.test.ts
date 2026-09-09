import { describe, expect, it } from 'vitest';
import { getSteeringLimit, metersPerSecondToKmh, resolveBrakeReverse, vehicleLookAhead } from './VehicleMovement';
import { createVehicleState, serializeVehicleState } from './VehicleState';
describe('vehicle pure logic', () => {
  it('maps speed, braking, reverse, steering, and streaming look-ahead deterministically', () => {
    expect(metersPerSecondToKmh(10)).toBe(36);
    expect(resolveBrakeReverse(4, true)).toEqual({ brake: 1, reverse: 0 });
    expect(resolveBrakeReverse(0, true)).toEqual({ brake: 0, reverse: 1 });
    expect(getSteeringLimit(30, .5, .6, 30)).toBeCloseTo(.3);
    expect(vehicleLookAhead({x:0,z:0},{x:4,z:0},18)).toEqual({x:18,z:0});
  });
  it('serializes vehicle state without physics or render references', () => {
    const state=createVehicleState('vehicle:test',{x:1,y:2,z:3},.4); state.occupied=true;
    expect(serializeVehicleState(state)).toEqual(state);
  });
});
