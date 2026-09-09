import { describe, expect, it } from 'vitest';
import type { VehicleController } from './VehicleController';
import { VehicleManager } from './VehicleManager';

describe('VehicleManager', () => {
  it('keeps reusable vehicle lookup and nearest queries renderer-independent', () => {
    const manager = new VehicleManager();
    const first = { getState: () => ({ id: 'a', position: { x: 3, y: 0, z: 2 } }) };
    const second = { getState: () => ({ id: 'b', position: { x: 30, y: 0, z: 2 } }) };
    manager.register(first as unknown as VehicleController);
    manager.register(second as unknown as VehicleController);
    expect(manager.count).toBe(2);
    expect(manager.getVehicleById('b')).toBe(second);
    expect(manager.getNearestVehicle({ x: 0, z: 0 })).toBe(first);
    manager.unregister('a');
    expect(manager.count).toBe(1);
  });
});
