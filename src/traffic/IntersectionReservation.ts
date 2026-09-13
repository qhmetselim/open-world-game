interface Reservation { readonly vehicleId: string; expiresAt: number; }
interface Request { readonly vehicleId: string; readonly arrivedAt: number; priority: number; }

/** One vehicle at a time per generated intersection; stale reservations expire. */
export class IntersectionReservationBook {
  private readonly reservations = new Map<string, Reservation>();
  private readonly queues = new Map<string, Request[]>();

  public enqueue(intersectionId: string, vehicleId: string, nowSeconds: number, priority = 0): void {
    if (this.reservations.get(intersectionId)?.vehicleId === vehicleId) return;
    const queue = this.queues.get(intersectionId) ?? [];
    const existing = queue.find((request) => request.vehicleId === vehicleId);
    if (existing) existing.priority = priority;
    else queue.push({ vehicleId, arrivedAt: nowSeconds, priority });
    this.queues.set(intersectionId, queue);
  }

  public request(intersectionId: string, vehicleId: string, nowSeconds: number, durationSeconds: number, priority = 0, maxWait = 12): boolean {
    this.expire(nowSeconds);
    const current = this.reservations.get(intersectionId);
    if (current?.vehicleId === vehicleId) return true;
    this.enqueue(intersectionId, vehicleId, nowSeconds, priority);
    const queue = this.queues.get(intersectionId)!;
    queue.sort((a, b) => {
      const agedA = nowSeconds - a.arrivedAt >= maxWait; const agedB = nowSeconds - b.arrivedAt >= maxWait;
      return Number(agedB) - Number(agedA) || (agedA && agedB ? a.arrivedAt - b.arrivedAt : b.priority - a.priority)
        || a.arrivedAt - b.arrivedAt || a.vehicleId.localeCompare(b.vehicleId);
    });
    if (current !== undefined || queue[0]?.vehicleId !== vehicleId) return false;
    queue.shift();
    if (queue.length === 0) this.queues.delete(intersectionId);
    this.reservations.set(intersectionId, { vehicleId, expiresAt: nowSeconds + durationSeconds });
    return true;
  }

  public release(intersectionId: string | undefined, vehicleId: string): void {
    if (intersectionId !== undefined && this.reservations.get(intersectionId)?.vehicleId === vehicleId) this.reservations.delete(intersectionId);
    for (const [id, queue] of this.queues) {
      const index = queue.findIndex((request) => request.vehicleId === vehicleId);
      if (index >= 0) queue.splice(index, 1);
      if (queue.length === 0) this.queues.delete(id);
    }
  }

  /** Never hand a physically occupied conflict box to another vehicle when its lease expires. */
  public retainOccupied(intersectionId: string, vehicleId: string, nowSeconds: number): void {
    const reservation = this.reservations.get(intersectionId);
    if (reservation?.vehicleId === vehicleId) reservation.expiresAt = Math.max(reservation.expiresAt, nowSeconds + 1);
  }

  public expire(nowSeconds: number): void {
    for (const [id, reservation] of this.reservations) if (reservation.expiresAt <= nowSeconds) this.reservations.delete(id);
  }

  public get count(): number { return this.reservations.size; }
  public clear(): void { this.reservations.clear(); this.queues.clear(); }
}
