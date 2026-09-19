import type { VehicleController } from './VehicleController';
import type { VehicleState } from './VehicleState';
import type { GameConfig } from '../core/Config';
import { isVehicleEnterEligible } from './VehicleInteraction';

export interface ManagedVehicleView {
  update(state: VehicleState): void;
  setVisible(visible: boolean): void;
  setDebugVisible(visible: boolean): void;
  dispose(): void;
}

export class VehicleManager {
  private readonly vehicles = new Map<string, VehicleController>();
  private readonly views = new Map<string, ManagedVehicleView>();

  public register(vehicle: VehicleController, view?: ManagedVehicleView): void {
    if (this.vehicles.has(vehicle.getState().id)) throw new Error('Duplicate managed vehicle ID.');
    this.vehicles.set(vehicle.getState().id, vehicle);
    if (view) this.views.set(vehicle.getState().id, view);
  }

  public unregister(id: string): void {
    this.views.get(id)?.dispose(); this.views.delete(id);
    this.vehicles.delete(id);
  }

  public getAll(): readonly VehicleController[] { return [...this.vehicles.values()]; }
  public getEnterCandidate(position: { x: number; y?: number; z: number }, config: GameConfig['vehicle']['interaction']): VehicleController | undefined {
    return this.getAll().filter((vehicle) => vehicle.getBody()?.isEnabled()
      && isVehicleEnterEligible(position, vehicle.getState(), config.enterDistance, config.maxEnterSpeed))
      .sort((a, b) => Math.hypot(a.getState().position.x - position.x, a.getState().position.z - position.z)
        - Math.hypot(b.getState().position.x - position.x, b.getState().position.z - position.z)
        || a.getState().id.localeCompare(b.getState().id))[0];
  }
  public render(alpha: number): void {
    for (const [id, vehicle] of this.vehicles) this.views.get(id)?.update(vehicle.getRenderState(alpha));
  }
  public setDebugVisible(visible: boolean): void { for (const view of this.views.values()) view.setDebugVisible(visible); }
  /** Parked cars outside loaded terrain retain their transform instead of falling into unloaded void. */
  public setSimulationEnabled(vehicle: VehicleController, enabled: boolean): void {
    const body = vehicle.getBody();
    if (body && body.isEnabled() !== enabled) body.setEnabled(enabled);
    this.views.get(vehicle.getState().id)?.setVisible(enabled);
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
    for (const view of this.views.values()) view.dispose(); this.views.clear();
    for (const vehicle of this.vehicles.values()) vehicle.dispose();
    this.vehicles.clear();
  }
}
