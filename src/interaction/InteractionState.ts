export interface InteractionConfig {
  readonly range: number;
  readonly minimumFacingDot: number;
  readonly doorWidth: number;
  readonly doorHeight: number;
  readonly doorThickness: number;
  readonly vestibuleDepth: number;
  readonly frameThickness: number;
  readonly foundationPadding: number;
  readonly maximumGroundVariation: number;
  readonly motionSeconds: number;
}

export interface InteractionPoint { readonly x: number; readonly y: number; readonly z: number }
export interface Interactable {
  readonly id: string;
  readonly type: 'door' | 'toggle';
  readonly ownerChunk: string;
  /** Feet/base origin, distinct from the eye-height interaction anchor. */
  readonly position: InteractionPoint;
  readonly anchor: InteractionPoint;
  readonly yaw: number;
  readonly radius: number;
  readonly enabled: boolean;
  readonly actionLabel: string;
  readonly minimumFacingDot?: number;
}
export interface InteractionState {
  phase: 'closed' | 'opening' | 'open' | 'closing';
  amount: number;
  on: boolean;
}

export function initialInteractionState(): InteractionState { return { phase: 'closed', amount: 0, on: false }; }
export function requestInteraction(item: Interactable, state: InteractionState): void {
  if (!item.enabled) return;
  if (item.type === 'toggle') state.on = !state.on;
  else state.phase = state.phase === 'closed' || state.phase === 'closing' ? 'opening' : 'closing';
}
export function advanceDoor(state: InteractionState, dt: number, duration: number): void {
  if (state.phase !== 'opening' && state.phase !== 'closing') return;
  state.amount = Math.max(0, Math.min(1, state.amount + (state.phase === 'opening' ? 1 : -1) * Math.max(0, dt) / duration));
  if (state.amount === 1) state.phase = 'open';
  else if (state.amount === 0) state.phase = 'closed';
}
export function interactionLabel(item: Interactable, state: InteractionState): string {
  if (item.type === 'toggle') return `${state.on ? 'Disable' : 'Enable'} ${item.actionLabel}`;
  return `${state.phase === 'open' || state.phase === 'opening' ? 'Close' : 'Open'} ${item.actionLabel}`;
}

/** Player yaw uses -Z forward (vehicle +Z convention is deliberately not reused). */
export function selectInteraction(
  candidates: readonly Interactable[], position: InteractionPoint, facingYaw: number,
  config: InteractionConfig, visible: (item: Interactable) => boolean
): Interactable | undefined {
  const ranked = candidates.filter((item) => item.enabled).map((item) => {
    const dx = item.anchor.x - position.x; const dz = item.anchor.z - position.z;
    const horizontal = Math.hypot(dx, dz);
    const distance = Math.hypot(horizontal, item.anchor.y - position.y);
    const facing = horizontal < .001 ? 1 : (dx * Math.sin(facingYaw) - dz * Math.cos(facingYaw)) / horizontal;
    return { item, distance, facing, score: distance / Math.min(item.radius, config.range) + (1 - facing) };
  }).filter((candidate) => candidate.distance <= Math.min(candidate.item.radius, config.range)
    && candidate.facing >= (candidate.item.minimumFacingDot ?? config.minimumFacingDot))
    .sort((a, b) => a.score - b.score || a.item.id.localeCompare(b.item.id));
  // Cheap range/facing checks precede LOS; usually one ray, only local alternatives on occlusion.
  return ranked.find(({ item }) => visible(item))?.item;
}

export type InteractionContext = { readonly kind: 'vehicleExit' | 'vehicleEnter' } | { readonly kind: 'world'; readonly id: string };
export function resolveInteractionContext(driving: boolean, worldTarget: string | undefined, canEnter: boolean): InteractionContext | undefined {
  if (driving) return { kind: 'vehicleExit' };
  if (worldTarget !== undefined) return { kind: 'world', id: worldTarget };
  return canEnter ? { kind: 'vehicleEnter' } : undefined;
}

export function dispatchInteraction(context: InteractionContext | undefined, world: () => void, vehicle: () => void): void {
  if (context?.kind === 'world') world();
  else if (context !== undefined) vehicle();
}

export function localInteractionPoint(item: Interactable, x: number, y: number, z: number): InteractionPoint {
  const c = Math.cos(item.yaw); const s = Math.sin(item.yaw);
  return { x: item.position.x + x * c + z * s, y: item.position.y + y, z: item.position.z - x * s + z * c };
}

/** The same hinge transform drives the fixed collider and interpolated visual. */
export function doorTransform(item: Interactable, amount: number, config: InteractionConfig): { position: InteractionPoint; yaw: number } {
  const angle = amount * Math.PI / 2;
  return {
    position: localInteractionPoint(item, -config.doorWidth / 2 + Math.cos(angle) * config.doorWidth / 2, config.doorHeight / 2, -Math.sin(angle) * config.doorWidth / 2),
    yaw: item.yaw + angle
  };
}
