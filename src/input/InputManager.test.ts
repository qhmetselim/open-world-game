import { describe, expect, it } from 'vitest';
import { InputManager } from './InputManager';

function createKeyboardEvent(type: 'keydown' | 'keyup', code: string): KeyboardEvent {
  return Object.assign(new Event(type), { code }) as KeyboardEvent;
}

describe('InputManager', () => {
  it('maps physical keys to action state and one-shot presses', () => {
    const target = new EventTarget();
    const input = new InputManager(target as unknown as Window);

    target.dispatchEvent(createKeyboardEvent('keydown', 'KeyW'));
    expect(input.isActive('moveForward')).toBe(true);
    expect(input.consumePressed('moveForward')).toBe(true);
    expect(input.consumePressed('moveForward')).toBe(false);

    target.dispatchEvent(createKeyboardEvent('keyup', 'KeyW'));
    expect(input.isActive('moveForward')).toBe(false);
    input.dispose();
  });

  it('does not re-fire a held action from keyboard repeat events', () => {
    const target = new EventTarget();
    const input = new InputManager(target as unknown as Window);
    let pressCount = 0;
    input.onPressed('jump', () => {
      pressCount += 1;
    });

    target.dispatchEvent(createKeyboardEvent('keydown', 'Space'));
    target.dispatchEvent(createKeyboardEvent('keydown', 'Space'));

    expect(pressCount).toBe(1);
    input.dispose();
  });

  it('maps F4 to the road graph debug action', () => {
    const target = new EventTarget();
    const input = new InputManager(target as unknown as Window);

    target.dispatchEvent(createKeyboardEvent('keydown', 'F4'));

    expect(input.consumePressed('toggleRoadDebug')).toBe(true);
    input.dispose();
  });

  it('maps F5 to the building debug action', () => {
    const target = new EventTarget();
    const input = new InputManager(target as unknown as Window);

    target.dispatchEvent(createKeyboardEvent('keydown', 'F5'));

    expect(input.consumePressed('toggleBuildingDebug')).toBe(true);
    input.dispose();
  });

  it('maps vehicle, NPC debug, and recovery keys through the semantic action layer', () => {
    const target = new EventTarget();
    const input = new InputManager(target as unknown as Window);
    target.dispatchEvent(createKeyboardEvent('keydown', 'F6'));
    target.dispatchEvent(createKeyboardEvent('keydown', 'F7'));
    target.dispatchEvent(createKeyboardEvent('keydown', 'KeyR'));
    expect(input.consumePressed('toggleVehicleDebug')).toBe(true);
    expect(input.consumePressed('toggleNpcDebug')).toBe(true);
    expect(input.consumePressed('resetVehicle')).toBe(true);
    input.dispose();
  });
});
