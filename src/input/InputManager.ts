import type { GameAction } from './actions';

const keyBindings: Readonly<Record<string, GameAction>> = {
  KeyW: 'moveForward',
  KeyS: 'moveBackward',
  KeyA: 'moveLeft',
  KeyD: 'moveRight',
  Space: 'jump',
  KeyE: 'interact',
  ShiftLeft: 'sprint',
  ShiftRight: 'sprint',
  Escape: 'pause',
  F3: 'toggleDebug',
  F2: 'toggleCamera',
  F4: 'toggleRoadDebug',
  F5: 'toggleBuildingDebug'
  ,F6: 'toggleVehicleDebug', KeyR: 'resetVehicle'
};

export interface PointerDelta {
  readonly x: number;
  readonly y: number;
}

export class InputManager {
  private readonly activeActions = new Set<GameAction>();
  private readonly pressedActions = new Set<GameAction>();
  private readonly pointerButtons = new Set<number>();
  private readonly pressListeners = new Map<GameAction, Set<() => void>>();
  private readonly pointerLockListeners = new Set<(locked: boolean) => void>();
  private pointerDelta: PointerDelta = { x: 0, y: 0 };
  private pointerLockElement: HTMLElement | undefined;

  public constructor(private readonly target: Window = window) {
    target.addEventListener('keydown', this.onKeyDown);
    target.addEventListener('keyup', this.onKeyUp);
    target.addEventListener('blur', this.clearState);
    target.addEventListener('pointerdown', this.onPointerDown);
    target.addEventListener('pointerup', this.onPointerUp);
    target.addEventListener('pointermove', this.onPointerMove);
    target.addEventListener('contextmenu', this.onContextMenu);
  }

  public isActive(action: GameAction): boolean {
    return this.activeActions.has(action);
  }

  public onPressed(action: GameAction, listener: () => void): () => void {
    const listeners = this.pressListeners.get(action) ?? new Set<() => void>();
    listeners.add(listener);
    this.pressListeners.set(action, listeners);
    return () => listeners.delete(listener);
  }

  public consumePressed(action: GameAction): boolean {
    return this.pressedActions.delete(action);
  }

  public getPointerDelta(): PointerDelta {
    const currentDelta = this.pointerDelta;
    this.pointerDelta = { x: 0, y: 0 };
    return currentDelta;
  }

  public isPointerButtonDown(button: number): boolean {
    return this.pointerButtons.has(button);
  }

  public get isPointerLocked(): boolean {
    return this.pointerLockElement !== undefined && document.pointerLockElement === this.pointerLockElement;
  }

  public configurePointerLock(element: HTMLElement): void {
    this.pointerLockElement?.removeEventListener('click', this.onPointerLockRequest);
    this.pointerLockElement = element;
    element.addEventListener('click', this.onPointerLockRequest);
    document.addEventListener('pointerlockchange', this.handlePointerLockChange);
  }

  public onPointerLockStateChange(listener: (locked: boolean) => void): () => void {
    this.pointerLockListeners.add(listener);
    return () => this.pointerLockListeners.delete(listener);
  }

  public clearActionState(): void {
    this.clearState();
  }

  public dispose(): void {
    this.target.removeEventListener('keydown', this.onKeyDown);
    this.target.removeEventListener('keyup', this.onKeyUp);
    this.target.removeEventListener('blur', this.clearState);
    this.target.removeEventListener('pointerdown', this.onPointerDown);
    this.target.removeEventListener('pointerup', this.onPointerUp);
    this.target.removeEventListener('pointermove', this.onPointerMove);
    this.target.removeEventListener('contextmenu', this.onContextMenu);
    this.pointerLockElement?.removeEventListener('click', this.onPointerLockRequest);
    if (this.pointerLockElement !== undefined) document.removeEventListener('pointerlockchange', this.handlePointerLockChange);
    this.clearState();
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.code === 'Escape' && this.isPointerLocked) return;
    const action = keyBindings[event.code];
    if (action === undefined) return;

    event.preventDefault();
    if (!this.activeActions.has(action)) {
      this.pressedActions.add(action);
      this.pressListeners.get(action)?.forEach((listener) => listener());
    }
    this.activeActions.add(action);
  };

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    const action = keyBindings[event.code];
    if (action === undefined) return;

    event.preventDefault();
    this.activeActions.delete(action);
  };

  private readonly onPointerDown = (event: PointerEvent): void => {
    this.pointerButtons.add(event.button);
  };

  private readonly onPointerUp = (event: PointerEvent): void => {
    this.pointerButtons.delete(event.button);
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    if (!this.isPointerLocked) return;
    this.pointerDelta = {
      x: this.pointerDelta.x + event.movementX,
      y: this.pointerDelta.y + event.movementY
    };
  };

  private readonly onContextMenu = (event: MouseEvent): void => {
    event.preventDefault();
  };

  private readonly onPointerLockRequest = (): void => {
    if (this.pointerLockElement !== undefined && !this.isPointerLocked) {
      void this.pointerLockElement.requestPointerLock().catch(() => undefined);
    }
  };

  private readonly handlePointerLockChange = (): void => {
    const locked = this.isPointerLocked;
    if (!locked) this.clearState();
    this.pointerLockListeners.forEach((listener) => listener(locked));
  };

  private readonly clearState = (): void => {
    this.activeActions.clear();
    this.pressedActions.clear();
    this.pointerButtons.clear();
    this.pointerDelta = { x: 0, y: 0 };
  };
}
