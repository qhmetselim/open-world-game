export const gameActions = [
  'moveForward',
  'moveBackward',
  'moveLeft',
  'moveRight',
  'jump',
  'interact',
  'sprint',
  'pause',
  'toggleDebug',
  'toggleCamera'
] as const;

export type GameAction = (typeof gameActions)[number];
