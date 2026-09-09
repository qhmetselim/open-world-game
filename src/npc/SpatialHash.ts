export class SpatialHash<T extends { readonly id: string; readonly position: { readonly x: number; readonly z: number } }> {
  private readonly entries = new Map<string, T>();
  private readonly cells = new Map<string, Set<string>>();
  private readonly entryCells = new Map<string, string>();
  public constructor(private readonly cellSize: number) {}
  public upsert(entry: T): void {
    const key = this.key(entry.position.x, entry.position.z); const previous = this.entryCells.get(entry.id);
    if (previous !== undefined && previous !== key) {
      const previousCell = this.cells.get(previous);
      previousCell?.delete(entry.id);
      if (previousCell?.size === 0) this.cells.delete(previous);
    }
    const cell = this.cells.get(key) ?? new Set<string>(); cell.add(entry.id); this.cells.set(key, cell); this.entries.set(entry.id, entry); this.entryCells.set(entry.id, key);
  }
  public remove(id: string): void { const key = this.entryCells.get(id); if (key !== undefined) { const cell = this.cells.get(key); cell?.delete(id); if (cell?.size === 0) this.cells.delete(key); } this.entries.delete(id); this.entryCells.delete(id); }
  public nearby(position: { readonly x: number; readonly z: number }, radius: number): readonly T[] {
    const minX = Math.floor((position.x - radius) / this.cellSize); const maxX = Math.floor((position.x + radius) / this.cellSize);
    const minZ = Math.floor((position.z - radius) / this.cellSize); const maxZ = Math.floor((position.z + radius) / this.cellSize); const result: T[] = [];
    for (let x = minX; x <= maxX; x += 1) for (let z = minZ; z <= maxZ; z += 1) for (const id of this.cells.get(`${x}:${z}`) ?? []) { const entry = this.entries.get(id); if (entry !== undefined && Math.hypot(entry.position.x - position.x, entry.position.z - position.z) <= radius) result.push(entry); }
    return result;
  }
  public get cellCount(): number { return this.cells.size; }
  public clear(): void { this.entries.clear(); this.cells.clear(); this.entryCells.clear(); }
  private key(x: number, z: number): string { return `${Math.floor(x / this.cellSize)}:${Math.floor(z / this.cellSize)}`; }
}
