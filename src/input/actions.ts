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
  'toggleCamera',
  'toggleRoadDebug',
  'toggleBuildingDebug',
  'toggleVehicleDebug',
  'resetVehicle'
] as const;

export type GameAction = (typeof gameActions)[number];
