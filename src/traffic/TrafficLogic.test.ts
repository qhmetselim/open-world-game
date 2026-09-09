import { describe, expect, it } from 'vitest';
import type { VehicleLane } from '../city/UrbanMobility';
import { chooseOutgoingLane, desiredTrafficSpeed, followingDesiredSpeed, lanePointAtProgress, laneSteering, safeFollowingDistance, shouldBeActive, speedControl, trafficSpeedMultiplier } from './TrafficLogic';

const lane: VehicleLane = { id: 'lane:a', roadId: 'road:a', direction: 'forward', laneIndex: 0, roadClass: 'local', speedMetadata: 30, startNodeId: 'a', endNodeId: 'b', path: [{ x: 0, z: 0 }, { x: 0, z: 100 }] };

describe('traffic pure logic', () => {
  it('keeps identity-derived speed, lane progress, and active hysteresis deterministic', () => {
    expect(trafficSpeedMultiplier(42, .9, 1.05)).toBe(trafficSpeedMultiplier(42, .9, 1.05));
    expect(desiredTrafficSpeed(30, 1)).toBeCloseTo(30 / 3.6);
    expect(lanePointAtProgress(lane, .25)).toEqual({ x: 0, z: 25 });
    expect(shouldBeActive(160, 150, 190, false)).toBe(false);
    expect(shouldBeActive(160, 150, 190, true)).toBe(true);
  });
  it('uses right-positive steering and proportional speed/following control', () => {
    expect(laneSteering(0, { x: 10, z: 10 }, { x: 0, z: 0 }, 1, .5)).toBeGreaterThan(0);
    expect(laneSteering(0, { x: -10, z: 10 }, { x: 0, z: 0 }, 1, .5)).toBeLessThan(0);
    expect(speedControl(3, 8, .2, .5).throttle).toBeGreaterThan(0);
    expect(speedControl(8, 3, .2, .5).brake).toBeGreaterThan(0);
    const safe = safeFollowingDistance(10, 8, 1.1);
    expect(followingDesiredSpeed(12, 4, safe / 2, safe)).toBeLessThan(4);
  });
  it('selects stable outgoing lanes without U-turn inference', () => {
    const connections = [
      { id: 'b', intersectionId: 'i', incomingLaneId: 'lane:a', outgoingLaneId: 'lane:right', turn: 'right' as const },
      { id: 'a', intersectionId: 'i', incomingLaneId: 'lane:a', outgoingLaneId: 'lane:straight', turn: 'straight' as const }
    ];
    expect(chooseOutgoingLane('lane:a', connections, 0)).toBe('lane:right');
    expect(chooseOutgoingLane('lane:a', connections, 1)).toBe('lane:straight');
    expect(chooseOutgoingLane('lane:none', connections, 1)).toBeUndefined();
  });
});
