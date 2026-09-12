interface Reservation { readonly vehicleId: string; expiresAt: number; }

/** One vehicle at a time per generated intersection; stale reservations expire. */
export class IntersectionReservationBook {
  private readonly reservations = new Map<string, Reservation>();
  private readonly queues = new Map<string, string[]>();

  public request(intersectionId: string, vehicleId: string, nowSeconds: number, durationSeconds: number): boolean {
    this.expire(nowSeconds);
    const current = this.reservations.get(intersectionId);
    if (current?.vehicleId === vehicleId) return true;
    const queue = this.queues.get(intersectionId) ?? [];
    if (!queue.includes(vehicleId)) queue.push(vehicleId);
    this.queues.set(intersectionId, queue);
    if (current !== undefined || queue[0] !== vehicleId) return false;
    queue.shift();
    if (queue.length === 0) this.queues.delete(intersectionId);
    this.reservations.set(intersectionId, { vehicleId, expiresAt: nowSeconds + durationSeconds });
    return true;
  }

  public release(intersectionId: string | undefined, vehicleId: string): void {
    if (intersectionId !== undefined && this.reservations.get(intersectionId)?.vehicleId === vehicleId) this.reservations.delete(intersectionId);
    for (const [id, queue] of this.queues) {
      const index = queue.indexOf(vehicleId);
      if (index >= 0) queue.splice(index, 1);
      if (queue.length === 0) this.queues.delete(id);
    }
  }

  public expire(nowSeconds: number): void {
    for (const [id, reservation] of this.reservations) if (reservation.expiresAt <= nowSeconds) this.reservations.delete(id);
  }

  public get count(): number { return this.reservations.size; }
  public clear(): void { this.reservations.clear(); this.queues.clear(); }
}
