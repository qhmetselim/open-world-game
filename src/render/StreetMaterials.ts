import { MeshStandardMaterial } from 'three';
import { visualTheme } from './VisualTheme';

/** Cosmetic, world-coordinate surface finish. No displacement or topology changes. */
export function createStreetMaterial(kind: 'asphalt' | 'sidewalk'): MeshStandardMaterial {
  const material = new MeshStandardMaterial({ color: visualTheme.street[kind], roughness: .95, metalness: 0 });
  material.onBeforeCompile = shader => {
    shader.vertexShader = 'varying vec2 streetWorld;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nstreetWorld = (modelMatrix * vec4(transformed, 1.0)).xz;');
    shader.fragmentShader = 'varying vec2 streetWorld;\n' + shader.fragmentShader;
    const finish = kind === 'asphalt'
      ? 'float tone = sin(streetWorld.x * .37) * sin(streetWorld.y * .29); diffuseColor.rgb *= .98 + .025 * tone;'
      : `vec2 slab = abs(fract(streetWorld / ${visualTheme.street.pavingSize.toFixed(2)}) - .5);
         vec2 aa = max(fwidth(streetWorld / ${visualTheme.street.pavingSize.toFixed(2)}), vec2(.003));
         vec2 joint = smoothstep(vec2(.48) - aa, vec2(.48) + aa, slab);
         diffuseColor.rgb *= 1.0 - max(joint.x, joint.y) * .11;`;
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n' + finish);
  };
  material.customProgramCacheKey = () => `street-finish-${kind}-1`;
  return material;
}
