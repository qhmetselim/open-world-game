import { BackSide, Color, Mesh, ShaderMaterial, SphereGeometry, Vector3 } from 'three';
import { visualTheme } from './VisualTheme';

/** Camera-centred opaque sky: no textures, transparency or shadow passes. */
export class ProceduralSky {
  public readonly mesh: Mesh<SphereGeometry, ShaderMaterial>;
  public constructor() {
    const theme = visualTheme.sky;
    const sun = visualTheme.lighting.sunOffset;
    const material = new ShaderMaterial({
      // Fog is blended after tone mapping by Three.js. Keep this display-referred
      // sky un-tonemapped so its horizon exactly matches the fog colour.
      side: BackSide, depthWrite: false, depthTest: false, toneMapped: false,
      uniforms: {
        zenith: { value: new Color(theme.zenith) }, horizon: { value: new Color(theme.horizon) },
        ground: { value: new Color(theme.ground) }, sunDirection: { value: new Vector3(sun.x, sun.y, sun.z).normalize() },
        sunColor: { value: new Color(visualTheme.lighting.sun) }
      },
      vertexShader: `varying vec3 skyDirection;
        void main() { skyDirection = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `uniform vec3 zenith; uniform vec3 horizon; uniform vec3 ground; uniform vec3 sunDirection; uniform vec3 sunColor;
        varying vec3 skyDirection;
        void main() {
          vec3 direction = normalize(skyDirection);
          // Keep the lower horizon haze-coloured too: distant fogged terrain
          // must not meet an immediately green/brown underside at the stream edge.
          float blend = direction.y >= 0.0 ? pow(direction.y, ${theme.gradientPower.toFixed(2)})
            : smoothstep(0.25, 0.9, -direction.y);
          vec3 color = mix(horizon, direction.y >= 0.0 ? zenith : ground, blend);
          float sun = max(dot(direction, sunDirection), 0.0);
          color += sunColor * (${theme.sunHalo.toFixed(2)} * pow(sun, 24.0)
            + ${theme.sunDisc.toFixed(1)} * smoothstep(${theme.sunDiscEdge}, 0.99995, sun));
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
