import { BoxGeometry, LineBasicMaterial, MeshStandardMaterial } from 'three';

export class BuildingRenderResources {
  public readonly unitBoxGeometry = new BoxGeometry(1, 1, 1);
  public readonly facadeMaterials = [
    new MeshStandardMaterial({ color: 0xc7c1b3, roughness: 0.88 }),
    new MeshStandardMaterial({ color: 0xa99b89, roughness: 0.9 }),
    new MeshStandardMaterial({ color: 0x8d8179, roughness: 0.92 }),
    new MeshStandardMaterial({ color: 0xa06d5d, roughness: 0.91 })
  ] as const;
  public readonly foundationMaterial = new MeshStandardMaterial({ color: 0x6c706d, roughness: 0.96 });
  public readonly roofMaterial = new MeshStandardMaterial({ color: 0x464c50, roughness: 0.9 });
  public readonly windowMaterial = new MeshStandardMaterial({ color: 0x314b58, roughness: 0.5, metalness: 0.15 });
  public readonly entranceMaterial = new MeshStandardMaterial({ color: 0x242a2d, roughness: 0.82 });
  public readonly debugMaterial: LineBasicMaterial | undefined;

  public constructor(showDebug: boolean) {
    this.debugMaterial = showDebug ? new LineBasicMaterial({ color: 0x6df2b4, transparent: true, opacity: 0.86 }) : undefined;
  }

  public dispose(): void {
    this.unitBoxGeometry.dispose();
    for (const material of this.facadeMaterials) material.dispose();
    this.foundationMaterial.dispose();
    this.roofMaterial.dispose();
    this.windowMaterial.dispose();
    this.entranceMaterial.dispose();
    this.debugMaterial?.dispose();
  }
}
