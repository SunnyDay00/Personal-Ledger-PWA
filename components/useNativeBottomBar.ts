import { useEffect, useRef, useState } from 'react';
import type { PluginListenerHandle } from '@capacitor/core';
import { canUseNativeBottomBar, NativeBottomBar, NativeBottomBarAction, NativeBottomBarState } from '../services/nativeBottomBar';

// Native views sit above WKWebView regardless of CSS z-index. Yield to web
// dialogs and controls covering the bar, including sheets portaled to body.
const hasBlockingWebOverlay = () => {
  const barTop = window.innerHeight - 88;
  const barBottom = window.innerHeight - 24;
  return Array.from(document.querySelectorAll<HTMLElement>(
    '[aria-modal="true"], [role="dialog"], [role="alertdialog"], .fixed, .absolute'
  )).some(element => {
    if (element.closest('[data-web-bottom-bar]') || element.getClientRects().length === 0) return false;
    const style = window.getComputedStyle(element);
    if (style.visibility === 'hidden' || style.display === 'none') return false;
    if (element.matches('[aria-modal="true"], [role="dialog"], [role="alertdialog"]')) return true;
    if (!['absolute', 'fixed'].includes(style.position) || Number(style.zIndex) < 40 || style.zIndex === 'auto') return false;
    // Slide-up screens start below the viewport. They must block from mount,
    // since CSS animation progress does not produce DOM mutation records.
    if (element.classList.contains('animate-slide-up')) return true;
    const rect = element.getBoundingClientRect();
    return rect.top < barBottom && rect.bottom > barTop && rect.left < window.innerWidth - 16 && rect.right > 16;
  });
};

export const useNativeBottomBar = (
  state: NativeBottomBarState,
  onAction: (action: NativeBottomBarAction) => void
) => {
  const [available, setAvailable] = useState(false);
  const stateRef = useRef(state);
  const actionRef = useRef(onAction);
  stateRef.current = state;
  actionRef.current = onAction;

  useEffect(() => {
    if (!canUseNativeBottomBar()) return;
    let disposed = false;
    let listener: PluginListenerHandle | undefined;

    const initialize = async () => {
      try {
        listener = await NativeBottomBar.addListener('action', action => {
          if (!disposed) actionRef.current(action);
        });
        if (disposed) {
          await listener.remove();
          return;
        }
        // Keep the web fallback until native code confirms OS support.
        const result = await NativeBottomBar.update({ ...stateRef.current, visible: false });
        if (!disposed) setAvailable(result.available);
        if (!result.available && !disposed) {
          await listener.remove();
          listener = undefined;
        }
      } catch (error) {
        if (!disposed) console.warn('Native bottom bar unavailable; keeping web navigation', error);
      }
    };
    void initialize();

    return () => {
      disposed = true;
      void listener?.remove().catch(() => undefined);
      void NativeBottomBar.hide().catch(() => undefined);
    };
  }, []);

  useEffect(() => {
    if (!available) return;
    let disposed = false;
    let frame: number | undefined;
    let lastState = '';
    const sync = () => {
      frame = undefined;
      const next = { ...stateRef.current, visible: stateRef.current.visible && !hasBlockingWebOverlay() };
      const serialized = JSON.stringify(next);
      if (serialized === lastState) return;
      lastState = serialized;
      void NativeBottomBar.update(next).then(result => {
        if (!disposed && !result.available) setAvailable(false);
      }).catch(error => {
        if (disposed) return;
        console.warn('Native bottom bar update failed; restoring web navigation', error);
        setAvailable(false);
        void NativeBottomBar.hide().catch(() => undefined);
      });
    };
    const scheduleSync = () => {
      if (frame === undefined) frame = window.requestAnimationFrame(sync);
    };

    sync();
    const observer = new MutationObserver(scheduleSync);
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'hidden', 'aria-modal', 'role'],
    });
    window.addEventListener('resize', scheduleSync);
    return () => {
      disposed = true;
      observer.disconnect();
      window.removeEventListener('resize', scheduleSync);
      if (frame !== undefined) window.cancelAnimationFrame(frame);
    };
  }, [available, state.selectedTab, state.statsMode, state.trading, state.visible, state.themeMode, state.tintColor]);

  return available;
};
