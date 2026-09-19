export type ClothingCategory = 'top' | 'bottom' | 'shoes' | 'outerwear' | 'accessory';
export type AssetDefinition = { readonly id: string; readonly name: string } & (
  { readonly type: 'clothing'; readonly category: ClothingCategory }
  | { readonly type: 'furniture' | 'vehicle' | 'home' | 'personalItem' | 'permission' }
);
export interface PersonalAssetsState {
  /** Integer kuruş. No floating-point currency arithmetic. */
  readonly balance: number;
  readonly owned: readonly AssetDefinition[];
  readonly outfit: Partial<Record<ClothingCategory, string>>;
}
export interface PurchaseOffer { readonly asset: AssetDefinition; readonly price: number }
export type PurchaseResult = 'purchased' | 'alreadyOwned' | 'insufficientFunds';

function validMoney(amount: number): void {
  if (!Number.isSafeInteger(amount) || amount < 0) throw new RangeError('Money must be non-negative integer kuruş.');
}
function validAsset(asset: AssetDefinition): void {
  if (!asset.id.trim() || !asset.name.trim()) throw new Error('Assets require stable IDs and names.');
}

/** Session-owned economy/entitlements; independent of chunks, renderers, input and UI. */
export class PersonalAssets {
  private money: number;
  private readonly owned = new Map<string, AssetDefinition>();
  private readonly outfit: Partial<Record<ClothingCategory, string>> = {};
  public constructor(initialBalance = 0) { validMoney(initialBalance); this.money = initialBalance; }
  public get balance(): number { return this.money; }
  public addMoney(amount: number): void {
    validMoney(amount); validMoney(this.money + amount); this.money += amount;
  }
  public spendMoney(amount: number): boolean {
    validMoney(amount);
    if (amount > this.money) return false;
    this.money -= amount; return true;
  }
  public owns(id: string): boolean { return this.owned.has(id); }
  public grantAsset(asset: AssetDefinition): boolean {
    validAsset(asset);
    if (this.owns(asset.id)) return false;
    this.owned.set(asset.id, { ...asset }); return true;
  }
  public getOwned(type?: AssetDefinition['type']): readonly AssetDefinition[] {
    return [...this.owned.values()].filter((asset) => type === undefined || asset.type === type)
      .sort((a, b) => a.id.localeCompare(b.id)).map((asset) => ({ ...asset }));
  }
  public purchase(offer: PurchaseOffer): PurchaseResult {
    validMoney(offer.price); validAsset(offer.asset);
    if (this.owns(offer.asset.id)) return 'alreadyOwned';
    if (!this.spendMoney(offer.price)) return 'insufficientFunds';
    this.grantAsset(offer.asset); return 'purchased';
  }
  public equipClothing(id: string): boolean {
    const asset = this.owned.get(id);
    if (asset?.type !== 'clothing') return false;
    this.outfit[asset.category] = id; return true;
  }
  public unequipClothing(category: ClothingCategory): void { delete this.outfit[category]; }
  public serialize(): PersonalAssetsState { return { balance: this.money, owned: this.getOwned(), outfit: { ...this.outfit } }; }
}
