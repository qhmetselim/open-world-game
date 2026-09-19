import { expect, it } from 'vitest';
import { Scene } from 'three';
import { PersonalAssets } from './PersonalAssets';
import { developmentOffer } from './EconomyConfig';
import { WorldState } from '../simulation/WorldState';
import { formatMoney } from '../ui/MoneyHUD';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { InteractionManager } from '../interaction/InteractionManager';
import { defaultGameConfig } from '../core/Config';
import type { Interactable } from '../interaction/InteractionState';

it('uses safe integer kuruş for credits/debits, rejects invalid values and leaves insufficient funds unchanged', () => {
  const assets = new PersonalAssets(425_000);
  assets.addMoney(100_000); expect(assets.balance).toBe(525_000);
  expect(assets.spendMoney(25_001)).toBe(true); expect(assets.balance).toBe(499_999);
  expect(assets.spendMoney(500_000)).toBe(false); expect(assets.balance).toBe(499_999);
  for (const value of [-1, .1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    expect(() => assets.addMoney(value)).toThrow(); expect(() => assets.spendMoney(value)).toThrow();
  }
  expect(() => assets.addMoney(Number.MAX_SAFE_INTEGER)).toThrow();
  expect(assets.balance).toBe(499_999);
  expect(formatMoney(425_000)).toBe('4.250 ₺'); expect(formatMoney(125)).toBe('1,25 ₺');
});

it('purchases atomically, rejects duplicate ownership and cannot grant an unaffordable asset', () => {
  const assets = new PersonalAssets(10);
  expect(assets.purchase(developmentOffer)).toBe('insufficientFunds');
  expect(assets.getOwned()).toHaveLength(0); expect(assets.balance).toBe(10);
  assets.addMoney(developmentOffer.price - 10);
  expect(assets.purchase(developmentOffer)).toBe('purchased'); expect(assets.balance).toBe(0);
  expect(assets.purchase(developmentOffer)).toBe('alreadyOwned'); expect(assets.balance).toBe(0);
  expect(assets.getOwned('clothing')).toEqual([developmentOffer.asset]);
  expect(() => assets.purchase({ asset: { type: 'home', id: '', name: 'Invalid' }, price: 0 })).toThrow();
  expect(assets.getOwned()).toHaveLength(1);
});

it('keeps generic entitlements, wardrobe and furniture serializable and detached from returned snapshots', () => {
  const assets = new PersonalAssets(425_000);
  expect(assets.equipClothing(developmentOffer.asset.id)).toBe(false);
  assets.grantAsset(developmentOffer.asset); expect(assets.equipClothing(developmentOffer.asset.id)).toBe(true);
  for (const type of ['furniture', 'vehicle', 'home', 'personalItem', 'permission'] as const) {
    expect(assets.grantAsset({ id: `${type}:test`, name: type, type })).toBe(true);
    expect(assets.equipClothing(`${type}:test`)).toBe(false);
  }
  expect(assets.getOwned('furniture')).toHaveLength(1);
  const world = new WorldState('seed'); world.setPersonalAssets(assets);
  const snapshot = world.serialize().personalAssets!;
  expect(JSON.parse(JSON.stringify(snapshot))).toEqual(assets.serialize());
  expect(snapshot.outfit.top).toBe(developmentOffer.asset.id);
  snapshot.outfit.top = 'fake'; expect(assets.serialize().outfit.top).toBe(developmentOffer.asset.id);
  assets.unequipClothing('top'); expect(assets.serialize().outfit.top).toBeUndefined();
  assets.addMoney(100); expect(world.serialize().personalAssets?.balance).toBe(425_100);
});

it('dispatches purchase through the real interaction manager, rejects failed use and retains ownership across stream reload', async () => {
  const physics = new PhysicsWorld(); await physics.initialize(); const scene = new Scene();
  const assets = new PersonalAssets(0);
  const manager = new InteractionManager(scene, physics, defaultGameConfig.interaction,
    (action) => action === 'purchase:test' && assets.purchase(developmentOffer) === 'purchased');
  const item: Interactable = { id: 'purchase', ownerChunk: '0:0', type: 'toggle', enabled: true, radius: 2.8,
    position: { x: 0, y: 0, z: 0 }, anchor: { x: 0, y: 1, z: 0 }, yaw: 0, actionLabel: 'Buy', useAction: 'purchase:test' };
  const focus = () => { physics.step(1/60); manager.updateFocus({ x: 0, y: 1, z: 2 }, 0, undefined, true); };
  manager.registerChunk('0:0', [item]); focus();
  expect(manager.interactFocused()).toBe(false); expect(manager.getState(item.id)?.on).toBe(false);
  assets.addMoney(developmentOffer.price); expect(manager.interactFocused()).toBe(true);
  expect(assets.owns(developmentOffer.asset.id)).toBe(true); expect(manager.getState(item.id)?.on).toBe(true);
  manager.unloadChunk('0:0'); expect(manager.interactFocused()).toBe(false); expect(physics.bodyCount).toBe(0);
  manager.registerChunk('0:0', [item]); focus(); expect(manager.interactFocused()).toBe(false);
  expect(manager.getState(item.id)?.on).toBe(true); expect(assets.getOwned()).toHaveLength(1);
  manager.dispose(); expect(scene.children).toHaveLength(0); expect(physics.bodyCount).toBe(0); physics.dispose();
});
