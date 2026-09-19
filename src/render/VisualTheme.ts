/** Render-only daylight art direction; procedural identities and gameplay are unchanged. */
export const visualTheme = {
  sky: { zenith: 0x4485b6, horizon: 0xb6cfd9, ground: 0xd5c8ad, radius: 1000 },
  fog: { color: 0xb6cfd9, near: 150, far: 340 },
  lighting: {
    sun: 0xffebcb, sunIntensity: 3.1, sky: 0xc1def1, ground: 0x726751,
    hemisphereIntensity: 1.65, exposure: 1.0, sunOffset: { x: -65, y: 95, z: 45 }
  },
  shadows: { radius: 65, mapSize: 2048, near: 1, far: 260, bias: -0.00012, normalBias: 0.065 },
  terrain: { low: 0x617a60, high: 0x899976, variationScale: 0.019, heightScale: 0.035 },
  street: { asphalt: 0x424c51, sidewalk: 0xb4b0a1, curb: 0xd6cdb7, marking: 0xefe3c4 },
  building: {
    facades: [0xddd0b5, 0xb8c3b8, 0xc5b49f, 0xb8836c], foundation: 0x8a887a,
    roof: 0x56656a, windowTop: 0x9ab7c1, windowBottom: 0x345768, windowGlow: 0x426477, trim: 0xe0d5bb, entrance: 0x35494c,
    sillHeight: 0.1, sillOverhang: 0.12
  },
  character: { shirt: 0x386d79, skin: 0xd6a57b, trousers: 0x35424c, roughness: 0.88 },
  vehicle: { body: 0x456f83, glass: 0x527585, tire: 0x282d30, rim: 0xa6b1ac, rimEdge: 0x424b50, bodyRoughness: 0.36, glassRoughness: 0.24, metalness: 0.22 },
  interaction: { door: 0x537879, frame: 0xcbbd9e, handle: 0xd4b47b, pedestal: 0x4e6065, off: 0xab6956, on: 0x85bd9e },
  vegetation: { leaf: 0x607b60, bark: 0x81705c },
  environment: { leafLight: 0x789261, leafDark: 0x476c5a, wood: 0x9a7958, metal: 0x4a6063, stone: 0xa3a497, lamp: 0xe0d9b5, sign: 0x718d91, signFace: 0xded7be, accent: 0xad715a }
} as const;
