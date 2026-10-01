import { Scene } from 'three';
import { describe, expect, it } from 'vitest';
import { defaultGameConfig } from '../core/Config';
import type { BuildingData } from '../buildings/BuildingTypes';
import { BuildingChunkView } from './BuildingChunkView';
import { BuildingRenderResources } from './BuildingRenderResources';
import { updateVisualLods, visualLodRegistrationCount } from './VisualLod';
import { Vector3 } from 'three';

const building: BuildingData = {
  id: 'building:view', region: { x: 0, z: 0 }, parcelId: 'parcel:view', facingRoadId: 'road:view', seed: 2,
  type: 'mixedUse', style: { facadePaletteIndex: 2, roof: 'parapet' }, x: 0, z: 0, rotation: 0,
  width: 16, depth: 12, height: 15, floors: 5, baseElevation: 0, foundationHeight: 0.5,
  entranceSide: 'front', entrance: { x: 0, y: 1.2, z: -6, directionX: 0, directionZ: -1 }
};

describe('BuildingChunkView', () => {
  it('unload/reload releases LOD registrations and restores near windows without duplicating views', () => {
    const resources = new BuildingRenderResources(false), scene = new Scene();
    for (let cycle = 0; cycle < 3; cycle++) {
      const view = new BuildingChunkView([building], defaultGameConfig.building, resources, false);
      view.addTo(scene); expect(visualLodRegistrationCount(scene)).toBe(1);
      updateVisualLods(scene, new Vector3(500, 0, 0));
      expect(view.group.children.some(child => child.visible)).toBe(true); // Skyline is never erased.
      updateVisualLods(scene, new Vector3());
      expect(view.windowInstanceCount).toBeGreaterThan(0);
      view.dispose(scene); expect(visualLodRegistrationCount(scene)).toBe(0);
      expect(scene.children).toHaveLength(0);
    }
    resources.dispose();
  });
  it('batches procedural building, windows, roof, and debug geometry into a disposable chunk view', () => {
    const resources = new BuildingRenderResources(true);
    const view = new BuildingChunkView([building], defaultGameConfig.building, resources, false);
    const scene = new Scene();

    expect(view.visibleBuildingCount).toBe(1);
    expect(view.windowInstanceCount).toBeGreaterThan(0);
    expect(view.drawCallCount).toBeGreaterThan(0);
    view.addTo(scene);
    expect(scene.children).toHaveLength(1);
    view.setDebugVisible(true);
    view.dispose(scene);
    expect(scene.children).toHaveLength(0);
    resources.dispose();
  });
});
