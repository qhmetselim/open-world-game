import { describe, expect, it } from 'vitest';
import { PhysicsWorld } from './PhysicsWorld';

describe('PhysicsWorld static cuboids', () => {
  it('creates and removes a rotated static cuboid used by building collision', async () => {
    const physics = new PhysicsWorld();
    await physics.initialize();
    const body = physics.createStaticCuboid([10, 5, -2], [4, 8, 6], Math.PI / 2);

    expect(body.translation()).toMatchObject({ x: 10, y: 5, z: -2 });
    expect(Math.abs(body.rotation().y)).toBeCloseTo(Math.SQRT1_2);
    expect(physics.bodyCount).toBe(1);

    physics.removeRigidBody(body);
    expect(physics.bodyCount).toBe(0);
    physics.dispose();
  });

  it('returns a building cuboid hit to the shared camera raycast path', async () => {
    const physics = new PhysicsWorld();
    await physics.initialize();
    const body = physics.createStaticCuboid([0, 2, 0], [2, 2, 2], 0);
    physics.step(1 / 60);

    expect(physics.castRay([0, 2, 8], [0, 0, -1], 12, undefined)).toBeCloseTo(6);
    expect(physics.castRay([0, 2, 8], [0, 0, -1], 12, body)).toBeUndefined();

    physics.removeRigidBody(body);
    physics.dispose();
  });
});
