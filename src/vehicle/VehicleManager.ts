import type { VehicleController } from './VehicleController';

export class VehicleManager {
  private readonly vehicles = new Map<string, VehicleController>();

  public register(vehicle: VehicleController): void {
    this.vehicles.set(vehicle.getState().id, vehicle);
  }

  public unregister(id: string): void {
    this.vehicles.delete(id);
  }

  public getVehicleById(id: string): VehicleController | undefined {
    return this.vehicles.get(id);
  }

  public getNearestVehicle(position: { readonly x: number; readonly z: number }): VehicleController | undefined {
    let nearest: VehicleController | undefined;
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (const vehicle of this.vehicles.values()) {
      const state = vehicle.getState();
      const distance = (state.position.x - position.x) ** 2 + (state.position.z - position.z) ** 2;
      if (distance < nearestDistance) {
        nearest = vehicle;
        nearestDistance = distance;
      }
    }
    return nearest;
  }

  public get count(): number {
    return this.vehicles.size;
  }

  public dispose(): void {
    for (const vehicle of this.vehicles.values()) vehicle.dispose();
    this.vehicles.clear();
  }
}
