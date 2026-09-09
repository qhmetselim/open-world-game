import {
  ACESFilmicToneMapping,
  PCFSoftShadowMap,
  SRGBColorSpace,
  WebGLRenderer
} from 'three';
import type { Camera, Scene } from 'three';
import type { GameConfig } from '../core/Config';

export class Renderer {
  private readonly renderer: WebGLRenderer;

  public constructor(host: HTMLElement, private readonly config: GameConfig['rendering']) {
    this.renderer = new WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1;
    this.renderer.shadowMap.enabled = config.shadowsEnabled;
    this.renderer.shadowMap.type = PCFSoftShadowMap;
    this.renderer.domElement.className = 'game-canvas';
    this.renderer.domElement.addEventListener('webglcontextlost', this.onContextLost, false);
    host.append(this.renderer.domElement);
    window.addEventListener('resize', this.resize);
    this.resize();
  }

  public render(scene: Scene, camera: Camera): void {
    this.renderer.render(scene, camera);
  }

  public get drawCalls(): number {
    return this.renderer.info.render.calls;
  }

  public get triangleCount(): number {
    return this.renderer.info.render.triangles;
  }

  public dispose(): void {
    window.removeEventListener('resize', this.resize);
    this.renderer.domElement.removeEventListener('webglcontextlost', this.onContextLost);
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  private readonly resize = (): void => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.config.maxPixelRatio));
    this.renderer.setSize(width, height, false);
  };

  private readonly onContextLost = (event: Event): void => {
    event.preventDefault();
    throw new Error('WebGL context was lost. Reload the page to restart the engine.');
  };
}
