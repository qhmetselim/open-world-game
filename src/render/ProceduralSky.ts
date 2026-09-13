import { BackSide, Color, Mesh, ShaderMaterial, SphereGeometry, Vector3 } from 'three';
import { visualTheme } from './VisualTheme';

/** Camera-centred opaque sky: no textures, transparency or shadow passes. */
export class ProceduralSky {
  public readonly mesh: Mesh<SphereGeometry, ShaderMaterial>;
  public constructor() {
    const theme = visualTheme.sky;
    const sun = visualTheme.lighting.sunOffset;
    const material = new ShaderMaterial({
      side: BackSide, depthWrite: false, depthTest: false,
      uniforms: {
        zenith: { value: new Color(theme.zenith) }, horizon: { value: new Color(theme.horizon) },
        ground: { value: new Color(theme.ground) }, sunDirection: { value: new Vector3(sun.x, sun.y, sun.z).normalize() }
      },
      vertexShader: `varying vec3 skyDirection;
        void main() { skyDirection = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `uniform vec3 zenith; uniform vec3 horizon; uniform vec3 ground; uniform vec3 sunDirection;
        varying vec3 skyDirection;
        void main() {
          vec3 direction = normalize(skyDirection);
          vec3 color = mix(horizon, zenith, pow(max(direction.y, 0.0), 0.45));
          color = mix(color, ground, smoothstep(0.0, 0.45, -direction.y));
          float sun = max(dot(direction, sunDirection), 0.0);
          color += vec3(0.24, 0.17, 0.08) * pow(sun, 24.0);
          gl_FragColor = vec4(color, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`
    });
    this.mesh = new Mesh(new SphereGeometry(theme.radius, 24, 12), material);
    this.mesh.renderOrder = -1000;
    this.mesh.frustumCulled = false;
  }
  public dispose(): void { this.mesh.geometry.dispose(); this.mesh.material.dispose(); }
}
