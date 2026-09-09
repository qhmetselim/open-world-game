import { describe, expect, it } from 'vitest';
import { buildRoadSurface, clipRoadSegmentToBounds, sampleRoadSegment } from './RoadGeometry';
import type { ResolvedRoadSegment } from './CityTypes';

const segment: ResolvedRoadSegment = {
  id: 'road:local:test', startNodeId: 'node:0:0', endNodeId: 'node:256:0',
  type: 'local', width: 8, start: { x: 0, z: 0 }, end: { x: 256, z: 0 }
};

describe('road geometry helpers', () => {
  it('clips a world-coordinate segment exactly at chunk bounds', () => {
    const clipped = clipRoadSegmentToBounds(segment, { minX: 128, maxX: 256, minZ: -16, maxZ: 16 });

    expect(clipped?.start).toEqual({ x: 128, z: 0 });
    expect(clipped?.end).toEqual({ x: 256, z: 0 });
  });

  it('samples segments at a bounded spacing while retaining exact endpoints', () => {
    const samples = sampleRoadSegment(segment.start, segment.end, 60);

    expect(samples).toHaveLength(6);
    expect(samples[0]).toEqual(segment.start);
    expect(samples.at(-1)).toEqual(segment.end);
  });

  it('uses road widths and terrain-following height with a visual offset', () => {
    const surface = buildRoadSurface([segment], (x, z) => x * 0.1 + z * 0, 0.08, 128);

    expect(surface.visibleSegmentCount).toBe(1);
    expect(surface.positions[0]).toBeCloseTo(0);
    expect(surface.positions[2]).toBeCloseTo(4);
    expect(surface.positions[4]).toBeCloseTo(0.08);
    expect(surface.positions[5]).toBeCloseTo(-4);
  });

  it('uses identical boundary vertices for adjacent clipped chunk surfaces', () => {
    const left = clipRoadSegmentToBounds(segment, { minX: 0, maxX: 128, minZ: -16, maxZ: 16 });
    const right = clipRoadSegmentToBounds(segment, { minX: 128, maxX: 256, minZ: -16, maxZ: 16 });
    if (left === undefined || right === undefined) throw new Error('Expected clips.');
    const leftSurface = buildRoadSurface([left], (x, z) => x * 0.01 + z * 0, 0.08, 128);
    const rightSurface = buildRoadSurface([right], (x, z) => x * 0.01 + z * 0, 0.08, 128);
    const leftBoundary = Array.from(leftSurface.positions.slice(-6));
    const rightBoundary = Array.from(rightSurface.positions.slice(0, 6));

    expect(leftBoundary).toEqual(rightBoundary);
  });
});
