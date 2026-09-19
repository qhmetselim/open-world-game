import { Scene } from 'three';
import { describe, expect, it } from 'vitest';
import type { CityRegionLayout } from '../city/CityTypes';
import { resolveRoadSegment } from '../city/CityTypes';
import { environmentProfile, generateEnvironment, distanceToRoad } from './EnvironmentGenerator';
import { EnvironmentResources } from '../render/EnvironmentResources';
import { EnvironmentChunkView } from '../render/EnvironmentChunkView';
import { environmentConfig } from './EnvironmentConfig';

const layout: CityRegionLayout = {
  coord: { x: 0, z: 0 }, key: '0:0', isUrban: true,
  nodes: [{ id: 'a', x: -128, z: 64 }, { id: 'b', x: 512, z: 64 }],
  segments: [{ id: 'road:test', startNodeId: 'a', endNodeId: 'b', type: 'arterial', width: 13 }], blocks: [], parcels: []
};
const generate = (x = 0, seed = 'open-world-001', layouts = [layout]) => generateEnvironment(seed, { x, z: 0 }, 128, layouts, [], 2.6, () => 0, { x: 12, z: 12 }, environmentProfile(seed, layout), 512);

describe('procedural environment', () => {
  it('regenerates stable owned props without road overlap or order-dependent duplicates', () => {
    const first = generate();
    expect(first.props.length).toBeGreaterThan(0);
    expect(generate()).toEqual(first);
    expect(generate(0, 'different-world')).not.toEqual(first);
    const neighbour = { ...layout, key: '1:0', coord: { x: 1, z: 0 }, nodes: [], segments: [] };
    expect(generate(0, 'open-world-001', [layout, neighbour])).toEqual(generate(0, 'open-world-001', [neighbour, layout]));
    const road = resolveRoadSegment(layout.segments[0]!, new Map(layout.nodes.map((node) => [node.id, node])));
    const all = [-128, 0, 128, 256].flatMap((origin) => {
      const data = generate(origin);
      for (const prop of data.props) {
        expect(prop.x).toBeGreaterThanOrEqual(origin); expect(prop.x).toBeLessThan(origin + 128);
        expect(distanceToRoad(prop, road)).toBeGreaterThan(road.width / 2 + 2.6);
        expect(Number.isFinite(prop.y)).toBe(true);
      }
      return data.props;
    });
    expect(new Set(all.map((prop) => prop.id)).size).toBe(all.length);
    expect(new Set(all.map((prop) => prop.kind))).toEqual(new Set(['tree', 'bush', 'lamp', 'bench', 'bin', 'sign', 'bollard', 'utility']));
    expect(first.props.length).toBeLessThanOrEqual(environmentConfig.maxPropsPerChunk);
  });

  it('culls batches and releases instances on unload without disposing shared templates', () => {
    const resources = new EnvironmentResources(); const scene = new Scene(); const data = generate();
    const view = new EnvironmentChunkView(data, { x: 0, z: 0 }, 128, resources);
    view.addTo(scene); view.updateVisibility({ x: 0, z: 0 });
    expect(view.visiblePropCount).toBe(data.props.length);
    view.updateVisibility({ x: 1000, z: 1000 }); expect(view.visiblePropCount).toBe(0);
    let disposed = 0;
    resources.templates.forEach((geometry) => geometry.addEventListener('dispose', () => disposed++));
    view.dispose(scene); expect(scene.children).toHaveLength(0); expect(disposed).toBe(0);
    const reload = new EnvironmentChunkView(generate(), { x: 0, z: 0 }, 128, resources);
    reload.addTo(scene); expect(reload.propCount).toBe(data.props.length); reload.dispose(scene);
    const count = resources.templates.size; resources.dispose(); expect(disposed).toBe(count);
  });
});
