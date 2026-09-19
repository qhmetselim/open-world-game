import type { PurchaseOffer } from './PersonalAssets';

export const economyConfig = { initialBalance: 425_000, feedbackSeconds: 2.5 } as const;
export const developmentOffer: PurchaseOffer = {
  asset: { id: 'clothing:development:linen-shirt', name: 'Keten gömlek', type: 'clothing', category: 'top' },
  price: 75_000
};
