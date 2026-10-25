import { Capacitor, PluginListenerHandle, registerPlugin } from '@capacitor/core';

export type BottomBarTab = 'home' | 'stats' | 'ledgers' | 'settings';

export interface NativeBottomBarState {
  selectedTab: BottomBarTab;
  statsMode: 'stats' | 'ai';
  trading: boolean;
  visible: boolean;
  themeMode: 'auto' | 'light' | 'dark';
  tintColor: string;
}

export type NativeBottomBarAction =
  | { type: 'tab'; tab: BottomBarTab }
  | { type: 'statsMode'; mode: 'stats' | 'ai' }
  | { type: 'add'; transactionType: 'expense' | 'income' };

interface NativeBottomBarPlugin {
  update(state: NativeBottomBarState): Promise<{ available: boolean }>;
  hide(): Promise<void>;
  addListener(event: 'action', listener: (action: NativeBottomBarAction) => void): Promise<PluginListenerHandle>;
}

export const NativeBottomBar = registerPlugin<NativeBottomBarPlugin>('NativeBottomBar');

export const canUseNativeBottomBar = () =>
  Capacitor.isNativePlatform()
  && Capacitor.getPlatform() === 'ios'
  && Capacitor.isPluginAvailable('NativeBottomBar');
