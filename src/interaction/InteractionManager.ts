import type { Scene } from 'three';
import type { PhysicsWorld } from '../physics/PhysicsWorld';
import { InteractionPhysics } from '../physics/InteractionPhysics';
import { InteractionRenderResources, InteractionView } from '../render/InteractionView';
import { SpatialHash } from '../npc/SpatialHash';
import type { Interactable, InteractionConfig, InteractionPoint, InteractionState } from './InteractionState';
import { advanceDoor, initialInteractionState, interactionLabel, requestInteraction, selectInteraction } from './InteractionState';

interface ActiveInteraction {
  readonly item: Interactable;
  readonly state: InteractionState;
  readonly physics: InteractionPhysics;
  readonly view: InteractionView;
  previousAmount: number;
}

export class InteractionManager {
  private readonly active = new Map<string, ActiveInteraction>();
  private readonly chunks = new Map<string, Set<string>>();
  private readonly session = new Map<string, InteractionState>();
  private readonly spatial: SpatialHash<Interactable>;
  private readonly resources = new InteractionRenderResources();
  private focused: string | undefined;
  public constructor(private readonly scene: Scene, private readonly physics: PhysicsWorld, private readonly config: InteractionConfig,
    private readonly use?: (action: string) => boolean) {
    this.spatial = new SpatialHash(config.range);
  }
  public registerChunk(key: string, items: readonly Interactable[]): void {
    if (this.chunks.has(key)) return;
    const ids = new Set<string>(); this.chunks.set(key, ids);
    for (const item of items) {
      if (item.ownerChunk !== key || this.active.has(item.id)) continue;
      const state = { ...(this.session.get(item.id) ?? initialInteractionState()) };
      const physics = new InteractionPhysics(this.physics, item, this.config, state.amount);
      const view = new InteractionView(this.scene, item, this.config, this.resources);
      view.update(state, state.amount, 1);
      this.active.set(item.id, { item, state, physics, view, previousAmount: state.amount });
      this.spatial.upsert(item); ids.add(item.id);
    }
  }
  public unloadChunk(key: string): void {
    for (const id of this.chunks.get(key) ?? []) {
      const entry = this.active.get(id);
      if (entry) {
        if (this.session.has(id)) this.session.set(id, { ...entry.state });
        entry.view.dispose(); entry.physics.dispose();
      }
      this.active.delete(id); this.spatial.remove(id);
      if (this.focused === id) this.focused = undefined;
    }
    this.chunks.delete(key);
  }
  public updateFocus(position: InteractionPoint, facingYaw: number, self: ReturnType<PhysicsWorld['createStaticBox']> | undefined, enabled: boolean): string | undefined {
    this.focused = enabled ? selectInteraction(this.spatial.nearby(position, this.config.range), position, facingYaw, this.config,
      (item) => this.physics.hasInteractionLineOfSight(position, item.anchor, self, this.active.get(item.id)?.physics.body))?.id : undefined;
    return this.focused;
  }
  /** Revalidate focus immediately before dispatch; no stale render reference can trigger an action. */
  public interactFocused(): boolean {
    const entry = this.focused === undefined ? undefined : this.active.get(this.focused);
    if (!entry?.item.enabled) return false;
    if (entry.item.useAction) {
      if (!this.use?.(entry.item.useAction)) return false;
      entry.state.on = true;
    } else requestInteraction(entry.item, entry.state);
    this.session.set(entry.item.id, { ...entry.state });
    return true;
  }
  public fixedUpdate(dt: number): void {
    for (const entry of this.active.values()) {
      entry.previousAmount = entry.state.amount;
      if (entry.item.type !== 'door') continue;
      const previousPhase = entry.state.phase;
      advanceDoor(entry.state, dt, this.config.motionSeconds);
      if (entry.state.amount === entry.previousAmount) continue;
      if (entry.physics.canMove(entry.state.amount)) entry.physics.move(entry.state.amount);
      else {
        entry.state.amount = entry.previousAmount;
        // A blocked closure reopens; a blocked opening pauses until the sweep is free.
        entry.state.phase = previousPhase === 'closing' ? 'opening' : previousPhase;
      }
    }
  }
  public render(alpha: number): void { for (const entry of this.active.values()) entry.view.update(entry.state, entry.previousAmount, alpha); }
  public get focusedId(): string | undefined { return this.focused; }
  public get count(): number { return this.active.size; }
  public get prompt(): string | undefined {
    const entry = this.focused === undefined ? undefined : this.active.get(this.focused);
    return entry === undefined ? undefined : interactionLabel(entry.item, entry.state);
  }
  public getState(id: string): Readonly<InteractionState> | undefined {
    const state = this.active.get(id)?.state;
    return state ? { ...state } : undefined;
  }
  public getActiveItems(): readonly Interactable[] { return [...this.active.values()].map((entry) => entry.item); }
  public dispose(): void {
    for (const key of [...this.chunks.keys()]) this.unloadChunk(key);
    this.session.clear(); this.spatial.clear(); this.resources.dispose();
  }
}
