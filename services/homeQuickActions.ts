import { Capacitor, registerPlugin } from '@capacitor/core';
import { HomeQuickAction, Ledger } from '../types';

interface NativeHomeQuickAction {
  id: string;
  title: string;
  ledgerId: string;
  type: 'expense' | 'income';
}

interface HomeQuickActionsPlugin {
  setItems(options: { items: NativeHomeQuickAction[] }): Promise<void>;
}

const NativeHomeQuickActions = registerPlugin<HomeQuickActionsPlugin>('HomeQuickActions');

export const getSortedHomeQuickActions = (actions: HomeQuickAction[] = []) =>
  [...actions]
    .sort((a, b) => a.order - b.order)
    .slice(0, 4)
    .map((action, index) => ({ ...action, order: index }));

export const syncIosHomeQuickActions = async (
  actions: HomeQuickAction[] = [],
  ledgers: Ledger[] = []
) => {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'ios') return;

  const ledgerIds = new Set(ledgers.filter(ledger => !ledger.isDeleted).map(ledger => ledger.id));
  const items = getSortedHomeQuickActions(actions)
    .filter(action => ledgerIds.has(action.ledgerId))
    .map(action => ({
      id: action.id,
      title: action.title.trim() || '记一笔',
      ledgerId: action.ledgerId,
      type: action.type,
    }));

  try {
    await NativeHomeQuickActions.setItems({ items });
  } catch (error) {
    console.warn('Failed to sync iOS home quick actions', error);
  }
};
