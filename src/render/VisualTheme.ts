/** Render-only daylight art direction; procedural identities and gameplay are unchanged. */
export const visualTheme = {
  interior: { wall: 0xd9cfb9, floor: 0x9d9380, ceiling: 0xe5ddc9 },
  sky: { zenith: 0x508ec2, horizon: 0xc2d5df, ground: 0x929c8b, radius: 1000,
    gradientPower: 0.65, sunHalo: 0.12, sunDisc: 4.0, sunDiscEdge: 0.9997,
    cloud: 0xe6e9e4, cloudCoverage: .63 },
  fog: { color: 0xc2d5df, near: 120, far: 325 },
  lighting: {
    sun: 0xfff3e2, sunIntensity: 3.2, sky: 0xc4dbef, ground: 0x737b6b,
    hemisphereIntensity: 0.95, exposure: 1.05, sunOffset: { x: -65, y: 95, z: 45 },
    environmentIntensity: 0.45, environmentWidth: 256
  },
  shadows: { radius: 54, mapSize: 2048, near: 1, far: 260, bias: -0.00008, normalBias: 0.035 },
  terrain: { low: 0x617a60, high: 0x899976, variationScale: 0.019, heightScale: 0.035 },
  street: { asphalt: 0x343d43, sidewalk: 0xb8b7ab, curb: 0xd2cfc0, marking: 0xeeeade, pavingSize: 1.25 },
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
