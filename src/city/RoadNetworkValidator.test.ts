import { describe, expect, it } from 'vitest';
import { defaultGameConfig as config } from '../core/Config';
import { CityLayoutGenerator } from './CityLayoutGenerator';
import { TerrainGenerator } from '../world/TerrainGenerator';
import { buildUrbanMobilityNetwork } from './UrbanMobility';
import { validateRoadNetwork } from './RoadNetworkValidator';
import { buildRoadSurface } from './RoadGeometry';

describe('road topology and visible junction integrity', () => {
  it('audits a 16x16 chunk area and distinguishes frontier and deliberate cul-de-sacs', () => {
    const terrain = new TerrainGenerator(config.world);
    const generator = new CityLayoutGenerator(config.world.seed, config.city, (x, z) => terrain.getHeight(x, z));
    const layouts = [];
    for (let x = -2; x < 2; x++) for (let z = -2; z < 2; z++) layouts.push(generator.generateRegion({ x, z }));
    const network = buildUrbanMobilityNetwork(layouts, config.city.mobility);
    const result = validateRoadNetwork(layouts, network);
    console.info('TOPOLOGY', result);
    expect(result.connectedComponentCount).toBe(1);
    expect(result.orphanRoadCount).toBe(0);
    expect(result.invalidEndpointCount + result.unexpectedDeadEndCount + result.disconnectedLaneCount + result.unreachableLaneCount + result.invalidIntersectionConnections + result.crossBoundaryFailures).toBe(0);
    expect(validateRoadNetwork([...layouts].reverse(), buildUrbanMobilityNetwork([...layouts].reverse(), config.city.mobility))).toEqual(result);
    expect(result.intentionalDeadEndCount).toBeGreaterThan(0);
  });
  it('faces owned intersection triangles upward without duplicate or hidden pavement', () => {
    const surface = buildRoadSurface([], () => 0, .08, 12, [{ id: 'junction', position: { x: 0, z: 0 }, halfExtent: 6.5 }]);
    for (let i = 0; i < surface.indices.length; i += 3) {
      const a = surface.indices[i]! * 3; const b = surface.indices[i + 1]! * 3; const c = surface.indices[i + 2]! * 3;
      const abX = surface.positions[b]! - surface.positions[a]!; const abZ = surface.positions[b + 2]! - surface.positions[a + 2]!;
      const acX = surface.positions[c]! - surface.positions[a]!; const acZ = surface.positions[c + 2]! - surface.positions[a + 2]!;
      expect(abZ * acX - abX * acZ).toBeGreaterThan(0);
    }
  });
  it('reports broken endpoints instead of silently accepting generation corruption', () => {
    const generator = new CityLayoutGenerator('audit', config.city, () => 0);
    const layout = generator.generateRegion({ x: 0, z: 0 });
    const corrupted = { ...layout, segments: [...layout.segments, { ...layout.segments[0]!, id: 'broken', endNodeId: 'missing' }] };
    expect(validateRoadNetwork([corrupted], buildUrbanMobilityNetwork([layout], config.city.mobility)).invalidEndpointCount).toBe(1);
    expect(() => new CityLayoutGenerator('steep', config.city, (x) => x).generateRegion({ x: 0, z: 0 })).toThrow('grade failure');
  });
});
