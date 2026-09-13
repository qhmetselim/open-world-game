import type { InteractionConfig } from './InteractionState';

export interface InteractionBox { readonly x: number; readonly y: number; readonly z: number; readonly width: number; readonly height: number; readonly depth: number }

/** Shared dimensions, used by both the view and static collision adapter. */
export function vestibuleBoxes(config: InteractionConfig): readonly InteractionBox[] {
  const t = config.frameThickness; const w = config.doorWidth + 4 * t; const h = config.doorHeight; const d = config.vestibuleDepth;
  return [
    { x: -(w - t) / 2, y: h / 2, z: -d / 2, width: t, height: h, depth: d },
    { x: (w - t) / 2, y: h / 2, z: -d / 2, width: t, height: h, depth: d },
    // An open-sky entry with a lintel, not a low ceiling that traps the chase camera.
    { x: 0, y: h + t / 2, z: 0, width: w, height: t, depth: t },
    { x: 0, y: -t / 2, z: -d / 2 + t, width: w, height: t, depth: d + 2 * t }
  ];
}
