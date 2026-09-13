import { DirectionalLight, Fog, HemisphereLight, Scene, Vector3 } from 'three';
import type { Camera } from 'three';
import { ProceduralSky } from './ProceduralSky';
import { visualTheme } from './VisualTheme';

export class SceneManager {
  public readonly scene = new Scene();
  private readonly sky = new ProceduralSky();
  private readonly sun = new DirectionalLight(visualTheme.lighting.sun, visualTheme.lighting.sunIntensity);
  private readonly hemisphere = new HemisphereLight(visualTheme.lighting.sky, visualTheme.lighting.ground, visualTheme.lighting.hemisphereIntensity);
  private readonly focus = new Vector3();
  private readonly offset = new Vector3(visualTheme.lighting.sunOffset.x, visualTheme.lighting.sunOffset.y, visualTheme.lighting.sunOffset.z);
  private readonly lightRight = new Vector3().crossVectors(new Vector3(0, 1, 0), this.offset).normalize();
  private readonly lightUp = new Vector3().crossVectors(this.offset, this.lightRight).normalize();

  public constructor() {
    const shadow = visualTheme.shadows;
    this.scene.fog = new Fog(visualTheme.fog.color, visualTheme.fog.near, visualTheme.fog.far);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(shadow.mapSize, shadow.mapSize);
    Object.assign(this.sun.shadow.camera, { left: -shadow.radius, right: shadow.radius, top: shadow.radius, bottom: -shadow.radius, near: shadow.near, far: shadow.far });
    this.sun.shadow.camera.updateProjectionMatrix();
    this.sun.shadow.bias = shadow.bias;
    this.sun.shadow.normalBias = shadow.normalBias;
    this.scene.add(this.sky.mesh, this.hemisphere, this.sun, this.sun.target);
  }

  /** View-only: follows all camera modes, never controls the streaming focus. */
  public update(camera: Camera): void {
    camera.getWorldPosition(this.focus);
    this.sky.mesh.position.copy(this.focus);
    // Snap the shadow projection in light space to reduce swimming while moving.
    const texel = visualTheme.shadows.radius * 2 / visualTheme.shadows.mapSize;
    const right = this.focus.dot(this.lightRight);
    const up = this.focus.dot(this.lightUp);
    this.focus.addScaledVector(this.lightRight, Math.round(right / texel) * texel - right);
    this.focus.addScaledVector(this.lightUp, Math.round(up / texel) * texel - up);
    this.sun.target.position.copy(this.focus);
    this.sun.position.copy(this.focus).add(this.offset);
  }

  public dispose(): void {
    // Entity/world owners dispose their resources; atmosphere belongs only here.
    this.sky.dispose(); this.sun.dispose(); this.hemisphere.dispose(); this.scene.clear();
  }
}
