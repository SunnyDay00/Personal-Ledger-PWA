import { describe, expect, it } from 'vitest';
import { coalesceAiViewportReduction, resolveAiKeyboardLayout } from './aiKeyboardLayout';

describe('AI keyboard layout', () => {
  it('uses the native keyboard height when Capacitor does not resize the WebView', () => {
    expect(resolveAiKeyboardLayout({
      nativeKeyboardHeight: 318,
      visualViewportReduction: 0,
      textareaFocused: true,
    })).toEqual({
      keyboardVisible: true,
      nativeOverlayInset: 318,
    });
  });

  it('does not double-shift when visualViewport already resized', () => {
    expect(resolveAiKeyboardLayout({
      nativeKeyboardHeight: 318,
      visualViewportReduction: 318,
      textareaFocused: true,
    })).toEqual({
      keyboardVisible: true,
      nativeOverlayInset: 0,
    });
  });

  it('supports browser and PWA keyboards without a native event', () => {
    expect(resolveAiKeyboardLayout({
      nativeKeyboardHeight: 0,
      visualViewportReduction: 260,
      textareaFocused: true,
    })).toEqual({
      keyboardVisible: true,
      nativeOverlayInset: 0,
    });
  });

  it('ignores viewport changes when the textarea is not focused', () => {
    expect(resolveAiKeyboardLayout({
      nativeKeyboardHeight: 0,
      visualViewportReduction: 260,
      textareaFocused: false,
    })).toEqual({
      keyboardVisible: false,
      nativeOverlayInset: 0,
    });
  });

  it('coalesces viewport animation frames until keyboard visibility changes', () => {
    expect(coalesceAiViewportReduction(0, 35)).toBe(0);
    expect(coalesceAiViewportReduction(0, 99)).toBe(0);
    expect(coalesceAiViewportReduction(0, 180)).toBe(180);
    expect(coalesceAiViewportReduction(180, 260)).toBe(180);
    expect(coalesceAiViewportReduction(180, 80)).toBe(80);
    expect(coalesceAiViewportReduction(80, 0)).toBe(80);
  });
});
