import { describe, expect, it } from 'vitest';
import { defaultGameConfig } from '../core/Config';
import { createVehicleState } from '../vehicle/VehicleState';
import { getVehicleCameraDesiredPosition, getVehicleCameraTarget, getVehicleForward } from './VehicleCameraMath';

describe('vehicle chase camera math', () => {
  it('uses chassis heading for the look-ahead target and a stable rear desired position', () => {
    const state = createVehicleState('sedan', { x: 10, y: 2, z: 20 }, 0);
    expect(getVehicleForward(0)).toEqual({ x: 0, z: 1 });
    expect(getVehicleCameraTarget(state, defaultGameConfig.vehicle.camera)).toEqual({
      x: 10,
      y: 3.15,
      z: 22.8
    });
    expect(getVehicleCameraDesiredPosition(state, 0, 0, defaultGameConfig.vehicle.camera)).toMatchObject({
      x: 10,
      y: 6.25,
      z: 14.3
    });
  });
});
