import { MeshStandardMaterial } from 'three';

/** Retain authored roughness/metalness in a single vertex-coloured draw call.
 * The packed surfaceFinish attribute belongs to the shared template geometry. */
export function createModuleMaterial(): MeshStandardMaterial {
  const material = new MeshStandardMaterial({ vertexColors: true });
  material.onBeforeCompile = shader => {
    shader.vertexShader = 'attribute vec2 surfaceFinish; varying vec2 vSurfaceFinish;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvSurfaceFinish = surfaceFinish;');
    shader.fragmentShader = 'varying vec2 vSurfaceFinish;\n' + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = clamp(vSurfaceFinish.x, 0.08, 1.0);')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = clamp(vSurfaceFinish.y, 0.0, 1.0);');
  };
  material.customProgramCacheKey = () => 'authored-module-finish-v1';
  return material;
}
