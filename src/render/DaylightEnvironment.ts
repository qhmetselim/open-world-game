import { Color, DataTexture, DataUtils, EquirectangularReflectionMapping, HalfFloatType, LinearFilter, LinearSRGBColorSpace, RGBAFormat, Vector3 } from 'three';
import { visualTheme } from './VisualTheme';

/** Tiny, generated linear-HDR sky for PBR reflections. Three.js caches its PMREM
 * once per renderer and releases it when this texture is disposed. No asset fetch,
 * per-frame capture, reflection camera or post-processing pass. */
export function createDaylightEnvironment(): DataTexture {
  const width = visualTheme.lighting.environmentWidth, height = width / 2;
  const data = new Uint16Array(width * height * 4);
  const sky = visualTheme.sky;
  const zenith = new Color(sky.zenith), horizon = new Color(sky.horizon), ground = new Color(sky.ground);
  const sun = new Vector3().copy(visualTheme.lighting.sunOffset).normalize();
  const sunColor = new Color(visualTheme.lighting.sun), color = new Color();
  for (let y = 0; y < height; y++) {
    const latitude = ((y + .5) / height - .5) * Math.PI;
    const elevation = Math.sin(latitude), horizontal = Math.cos(latitude);
    for (let x = 0; x < width; x++) {
      const longitude = ((x + .5) / width - .5) * Math.PI * 2;
      color.copy(horizon).lerp(elevation >= 0 ? zenith : ground, Math.pow(Math.abs(elevation), sky.gradientPower));
      const alignment = Math.max(0, horizontal * Math.cos(longitude) * sun.x + elevation * sun.y + horizontal * Math.sin(longitude) * sun.z);
      // Broad source survives low-resolution prefiltering without shimmering dots.
      const glow = sky.sunHalo * Math.pow(alignment, 24) + .8 * Math.pow(alignment, 256);
      const index = (y * width + x) * 4;
      data[index] = DataUtils.toHalfFloat(color.r + sunColor.r * glow);
      data[index + 1] = DataUtils.toHalfFloat(color.g + sunColor.g * glow);
      data[index + 2] = DataUtils.toHalfFloat(color.b + sunColor.b * glow);
      data[index + 3] = DataUtils.toHalfFloat(1);
    }
  }
  const texture = new DataTexture(data, width, height, RGBAFormat, HalfFloatType);
  texture.name = 'procedural-daylight'; texture.mapping = EquirectangularReflectionMapping;
  texture.colorSpace = LinearSRGBColorSpace; texture.minFilter = LinearFilter; texture.magFilter = LinearFilter;
  texture.needsUpdate = true;
  return texture;
}
