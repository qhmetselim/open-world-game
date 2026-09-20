export const combatConfig = {
  pistol: { id: 'weapon:pistol', damage: 34, fireRate: 4, magazineSize: 12, reserveAmmo: 60, reloadTime: 1.4, range: 90 },
  muzzle: { height: .4, right: .45, forward: .72 },
  flashSeconds: .07,
  hitFeedbackSeconds: .22,
  aimShoulderOffset: .8
} as const;
export type WeaponDefinition = { readonly id: string; readonly damage: number; readonly fireRate: number; readonly magazineSize: number; readonly reserveAmmo: number; readonly reloadTime: number; readonly range: number };
