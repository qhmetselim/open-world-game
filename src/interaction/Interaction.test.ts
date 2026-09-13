import { describe, expect, it } from 'vitest';
import { defaultGameConfig } from '../core/Config';
import { InputManager } from '../input/InputManager';
import { advanceDoor, dispatchInteraction, initialInteractionState, requestInteraction, resolveInteractionContext, selectInteraction } from './InteractionState';
import type { Interactable } from './InteractionState';

const config = defaultGameConfig.interaction;
const item = (id: string, x: number, z: number): Interactable => ({ id, type: 'door', ownerChunk: '0:0',
  position: { x, y: 0, z }, anchor: { x, y: 1, z }, yaw: 0, radius: config.range, enabled: true, actionLabel: 'Door' });
const observer = { x: 0, y: 1, z: 0 };

describe('world interaction selection and single E arbitration', () => {
  it('ranks by distance and facing, rejects behind/out-of-range/disabled targets, and breaks ties by stable ID', () => {
    const front = item('front', 0, -2); const back = item('back', 0, .5); const side = item('side', 1.4, -1);
    const select = (items: Interactable[]) => selectInteraction(items, observer, 0, config, () => true)?.id;
    expect(select([back, side, front])).toBe('front');
    expect(select([front, item('near', 0, -1)])).toBe('near');
    expect(select([item('far', 0, -4), back, { ...front, enabled: false }])).toBeUndefined();
    expect(select([item('b', 0, -2), item('a', 0, -2)])).toBe('a');
    expect(selectInteraction([front, side], observer, 0, config, (target) => target.id !== 'front')?.id).toBe('side');
  });

  it('routes one held E press to exactly one context, with exit exclusive and focused world before vehicle fallback', () => {
    const target = new EventTarget(); const input = new InputManager(target as unknown as Window);
    let world = 0; let vehicle = 0;
    const dispatch = (driving: boolean, focus: string | undefined, canEnter: boolean) => {
      if (input.consumePressed('interact')) dispatchInteraction(resolveInteractionContext(driving, focus, canEnter), () => world++, () => vehicle++);
    };
    const press = () => target.dispatchEvent(Object.assign(new Event('keydown'), { code: 'KeyE' }));
    const release = () => target.dispatchEvent(Object.assign(new Event('keyup'), { code: 'KeyE' }));
    press(); dispatch(false, 'door', true); press(); dispatch(false, 'door', true);
    expect([world, vehicle]).toEqual([1, 0]);
    release(); press(); dispatch(true, 'door', true);
    expect([world, vehicle]).toEqual([1, 1]);
    release(); press(); dispatch(false, undefined, true);
    expect([world, vehicle]).toEqual([1, 2]);
    expect(resolveInteractionContext(false, undefined, false)).toBeUndefined();
    input.dispose();
  });

  it('advances reversible door motion independently of frame rate and keeps toggle data serializable', () => {
    const door = item('door', 0, 0); const a = initialInteractionState(); const b = initialInteractionState();
    requestInteraction(door, a); requestInteraction(door, b);
    expect(a.phase).toBe('opening');
    for (let i = 0; i < 60; i++) advanceDoor(a, 1 / 60, config.motionSeconds);
    advanceDoor(b, 1, config.motionSeconds);
    expect(a).toEqual(b); expect(a.phase).toBe('open');
    requestInteraction(door, a); expect(a.phase).toBe('closing');
    advanceDoor(a, 1, config.motionSeconds); expect(a.phase).toBe('closed');
    requestInteraction({ ...door, type: 'toggle' }, a);
    expect(JSON.parse(JSON.stringify(a))).toEqual({ phase: 'closed', amount: 0, on: true });
  });
});
