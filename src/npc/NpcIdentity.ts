import { hashStringToSeed } from '../world/SeededNoise';
import type { NpcAppearance, NpcIdentity, NpcPresentation } from './NpcTypes';

const firstNames = ['Ada', 'Baran', 'Ceren', 'Deniz', 'Ece', 'Mert', 'Nehir', 'Ozan', 'Selin', 'Tuna', 'Yağmur', 'Zeynep'];
const lastNames = ['Aksoy', 'Aydın', 'Çelik', 'Demir', 'Ergin', 'Kaya', 'Öztürk', 'Şahin', 'Tekin', 'Yıldız'];
const shirts = [0x4977a8, 0xa75f4c, 0x5f8d6a, 0xb49c53, 0x866b9c, 0x3d6d70];
const pants = [0x263446, 0x3e4854, 0x615849, 0x334d68];
const skin = [0xf0c6a1, 0xd99d72, 0xb87854, 0x8f593e];
const hair = [0x231b18, 0x4b2f20, 0x72513b, 0x1d2027];

export function createNpcIdentity(worldSeed: string, id: string, districtId: string, walkSpeedMin: number, walkSpeedMax: number): NpcIdentity {
  const seed = hashStringToSeed(`${worldSeed}:${id}`);
  const presentation: NpcPresentation = seed % 2 === 0 ? 'feminine' : 'masculine';
  return {
    id,
    displayName: `${pick(firstNames, seed)} ${pick(lastNames, rotate(seed, 7))}`,
    presentation,
    age: 20 + (rotate(seed, 11) % 43),
    appearanceSeed: rotate(seed, 13),
    clothingSeed: rotate(seed, 17),
    districtId,
    walkSpeed: walkSpeedMin + unit(rotate(seed, 19)) * (walkSpeedMax - walkSpeedMin)
  };
}

export function createNpcAppearance(seed: number): NpcAppearance {
  return {
    heightScale: 0.9 + unit(seed) * 0.22,
    widthScale: 0.9 + unit(rotate(seed, 3)) * 0.16,
    shirtColor: pick(shirts, rotate(seed, 5)),
    pantsColor: pick(pants, rotate(seed, 7)),
    skinColor: pick(skin, rotate(seed, 11)),
    hairColor: pick(hair, rotate(seed, 13)),
    hairStyle: rotate(seed, 17) % 3
  };
}

function rotate(value: number, amount: number): number { return ((value << amount) | (value >>> (32 - amount))) >>> 0; }
function unit(value: number): number { return value / 0xffff_ffff; }
function pick<T>(values: readonly T[], seed: number): T { return values[seed % values.length] as T; }
