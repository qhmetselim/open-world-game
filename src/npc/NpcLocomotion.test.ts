import { describe, expect, it } from 'vitest';
import { anticipatedFacing, approachSpeed } from './NpcMovement';
import { smoothPedestrianRoute } from './NpcRoute';
import { projectPath } from '../traffic/TrafficPath';

describe('NPC locomotion feel', () => {
  it('rounds a corner without shortcutting outside the sidewalk corridor or mutating navigation IDs', () => {
    const nodes = [{ x: -4, z: -2 }, { x: 0, z: -2 }, { x: 0, z: 2 }].map((position, i) => ({ id: `node:${i}`, position, side: 'left' as const, roadId: 'street', connectionIds: [] }));
    const route = smoothPedestrianRoute(nodes, .6);
    expect(route.length).toBeGreaterThan(3);
    for (const point of route) expect(projectPath(nodes.map((node) => node.position), point.position).lateralError).toBeLessThanOrEqual(.151);
    expect(route[0]?.position).toEqual(nodes[0]?.position); expect(route.at(-1)?.position).toEqual(nodes.at(-1)?.position);
    expect(route.some((p) => p.position.x < 0 && p.position.x > -.6 && p.position.z > -2)).toBe(true);
    expect(route.every((p) => nodes.some((node) => node.id === p.nodeId))).toBe(true);
  });
  it('accelerates and decelerates in seconds without an instant velocity change', () => {
    expect(approachSpeed(0, 1.5, 2.4, 3.2, 1 / 60)).toBeCloseTo(.04);
    for (const fps of [30, 60, 120, 144]) {
      let speed = 0;
      for (let i = 0; i < fps; i++) speed = approachSpeed(speed, 1.5, 2.4, 3.2, 1 / fps);
      expect(speed).toBeCloseTo(1.5);
      for (let i = 0; i < fps; i++) speed = approachSpeed(speed, 0, 2.4, 3.2, 1 / fps);
      expect(speed).toBe(0);
    }
  });
  it('anticipates right and left corners without rewriting the pedestrian waypoints', () => {
    const corner = { x: 0, z: 1 };
    expect(anticipatedFacing({ x: 0, z: -3 }, corner, { x: 2, z: 1 }, 1.4)).toBe(0);
    expect(anticipatedFacing({ x: 0, z: .8 }, corner, { x: 2, z: 1 }, 1.4)).toBeGreaterThan(0);
    expect(anticipatedFacing({ x: 0, z: .8 }, corner, { x: -2, z: 1 }, 1.4)).toBeLessThan(0);
    expect(corner).toEqual({ x: 0, z: 1 });
  });
});
