import { BoxGeometry, BufferAttribute, Color, LineBasicMaterial, MeshStandardMaterial } from 'three';
import { visualTheme } from './VisualTheme';

export class BuildingRenderResources {
  public readonly unitBoxGeometry = new BoxGeometry(1, 1, 1);
  public readonly windowGeometry = new BoxGeometry(1, 1, 1);
  public readonly facadeMaterials = visualTheme.building.facades.map((color) => new MeshStandardMaterial({ color, roughness: 0.88 }));
  public readonly foundationMaterial = new MeshStandardMaterial({ color: visualTheme.building.foundation, roughness: 0.96 });
  public readonly roofMaterial = new MeshStandardMaterial({ color: visualTheme.building.roof, roughness: 0.86 });
  public readonly windowMaterial = new MeshStandardMaterial({ vertexColors: true, roughness: 0.32, metalness: 0.12, emissive: visualTheme.building.windowGlow, emissiveIntensity: 0.12 });
  public readonly trimMaterial = new MeshStandardMaterial({ color: visualTheme.building.trim, roughness: 0.86 });
  public readonly entranceMaterial = new MeshStandardMaterial({ color: visualTheme.building.entrance, roughness: 0.82 });
  public readonly debugMaterial: LineBasicMaterial | undefined;

  public constructor(showDebug: boolean) {
    // Baked vertical sky tint: an opaque glass impression without transparency or reflection passes.
    const positions = this.windowGeometry.getAttribute('position');
    const colors = new Float32Array(positions.count * 3);
    const top = new Color(visualTheme.building.windowTop);
    const bottom = new Color(visualTheme.building.windowBottom);
    for (let index = 0; index < positions.count; index++) {
      const color = positions.getY(index) > 0 ? top : bottom;
      color.toArray(colors, index * 3);
    }
    this.windowGeometry.setAttribute('color', new BufferAttribute(colors, 3));
    this.debugMaterial = showDebug ? new LineBasicMaterial({ color: 0x6df2b4, transparent: true, opacity: 0.86 }) : undefined;
  }

  public dispose(): void {
    this.unitBoxGeometry.dispose();
    this.windowGeometry.dispose();
    for (const material of this.facadeMaterials) material.dispose();
    this.foundationMaterial.dispose();
    this.roofMaterial.dispose();
    this.windowMaterial.dispose();
    this.trimMaterial.dispose();
    this.entranceMaterial.dispose();
    this.debugMaterial?.dispose();
  }
}
