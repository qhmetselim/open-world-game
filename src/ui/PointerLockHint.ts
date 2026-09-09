import type { InputManager } from '../input/InputManager';

export class PointerLockHint {
  private readonly element: HTMLDivElement;
  private unsubscribe: (() => void) | undefined;

  public constructor(host: HTMLElement, input: InputManager) {
    this.element = document.createElement('div');
    this.element.className = 'pointer-lock-hint';
    this.element.textContent = 'Click to play · F2: development camera';
    host.append(this.element);
    this.unsubscribe = input.onPointerLockStateChange((locked) => {
      this.element.hidden = locked;
    });
  }

  public dispose(): void {
    this.unsubscribe?.();
    this.element.remove();
  }
}
