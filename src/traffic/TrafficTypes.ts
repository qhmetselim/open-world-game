export type TrafficSimulationTier = 'active' | 'background';
export type TrafficActivity = 'cruising' | 'following' | 'braking' | 'waitingIntersection' | 'turning' | 'recovering';

export interface TrafficVehicleState {
  readonly id: string;
  readonly appearanceSeed: number;
  readonly color: number;
  laneId: string;
  nextLaneId: string | undefined;
  laneProgress: number;
  position: { x: number; y: number; z: number };
  yaw: number;
  rotation: { x: number; y: number; z: number; w: number };
  forwardSpeed: number;
  wheelContactCount: number;
  suspensionLengths: number[];
  routeTransitions: number;
  speed: number;
  desiredSpeed: number;
  steering: number;
  throttle: number;
  brake: number;
  wheelRotations: readonly [number, number, number, number];
  readonly speedMultiplier: number;
  tier: TrafficSimulationTier;
  activity: TrafficActivity;
  backgroundElapsed: number;
  reservationId: string | undefined;
  stuckSeconds: number;
}

export interface TrafficDebugInfo {
  readonly rejectedSpawns: number;
  readonly recoveryCount: number;
  readonly spinCount: number;
  readonly recoveringCount: number;
  readonly routeTransitions: number;
  readonly activeCount: number;
  readonly backgroundCount: number;
  readonly renderedCount: number;
  readonly cruisingCount: number;
  readonly followingCount: number;
  readonly brakingCount: number;
  readonly waitingCount: number;
  readonly controllerCount: number;
  readonly reservationCount: number;
  readonly activationCount: number;
  readonly deactivationCount: number;
  readonly debugEnabled: boolean;
}
