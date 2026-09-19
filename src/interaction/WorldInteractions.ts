import type { World } from '../world/World';
import { chunkCoordKey, worldPositionToChunkCoord } from '../world/ChunkCoord';
import type { InteractionManager } from './InteractionManager';
import type { Interactable, InteractionConfig } from './InteractionState';
import { createEntranceDoor } from './InteractionPlacement';
import { developmentOffer } from '../economy/EconomyConfig';

/** Optional chunk consumer: terrain/road/building generation remains unchanged. */
export class WorldInteractions {
  private revision = -1;
  private readonly loaded = new Set<string>();
  public constructor(private readonly world: World, private readonly manager: InteractionManager, private readonly config: InteractionConfig,
    private readonly chunkSize: number, private readonly spawn: { x: number; z: number }, private readonly developmentPurchase = false) {}
  public sync(): void {
    if (this.revision === this.world.streamingRevision) return;
    this.revision = this.world.streamingRevision;
    const chunks = this.world.getLoadedBuildingChunks();
    const keys = new Set(chunks.map((chunk) => chunk.key));
    for (const key of this.loaded) if (!keys.has(key)) { this.manager.unloadChunk(key); this.loaded.delete(key); }
    const toggleX = this.spawn.x + this.config.range; const toggleZ = this.spawn.z - this.config.range;
    const toggleChunk = chunkCoordKey(worldPositionToChunkCoord({ x: toggleX, z: toggleZ }, this.chunkSize));
    const purchaseX = this.spawn.x - this.config.range, purchaseZ = toggleZ;
    const purchaseChunk = chunkCoordKey(worldPositionToChunkCoord({ x: purchaseX, z: purchaseZ }, this.chunkSize));
    for (const chunk of chunks) {
      if (this.loaded.has(chunk.key)) continue;
      const items: Interactable[] = [];
      const interior = this.world.getInteriorLayouts().find((layout) => layout.door.ownerChunk === chunk.key);
      if (interior) items.push(interior.door);
      // One validated entrance per building-owner chunk, independent of load order.
      for (const building of [...chunk.buildings].sort((a, b) => a.id.localeCompare(b.id))) {
        if (interior) break;
        const door = createEntranceDoor(building, chunk.key, this.config,
          (x, z) => this.world.getTerrainHeight(x, z), (x, z) => this.world.isOutsideStreet(x, z));
        if (door) { items.push(door); break; }
      }
      if (chunk.key === toggleChunk) {
        const y = this.world.getTerrainHeight(toggleX, toggleZ);
        items.push({ id: 'interaction:development-toggle', type: 'toggle', ownerChunk: chunk.key,
          position: { x: toggleX, y, z: toggleZ }, anchor: { x: toggleX, y: y + 1.08, z: toggleZ },
          yaw: 0, radius: this.config.range, enabled: true, actionLabel: 'Indicator' });
      }
      if (this.developmentPurchase && chunk.key === purchaseChunk) {
        const y = this.world.getTerrainHeight(purchaseX, purchaseZ);
        items.push({ id: 'interaction:development-purchase', type: 'toggle', ownerChunk: chunk.key,
          position: { x: purchaseX, y, z: purchaseZ }, anchor: { x: purchaseX, y: y + 1.08, z: purchaseZ },
          yaw: 0, radius: this.config.range, enabled: true, useAction: 'purchase:development',
          actionLabel: `${developmentOffer.asset.name} satın al · ${developmentOffer.price / 100} ₺` });
      }
      this.manager.registerChunk(chunk.key, items); this.loaded.add(chunk.key);
    }
  }
}
