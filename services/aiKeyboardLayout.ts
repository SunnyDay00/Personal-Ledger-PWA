const KEYBOARD_VISIBILITY_THRESHOLD = 100;

const normalizeViewportReduction = (value: number) => (
  Number.isFinite(value) ? Math.max(0, value) : 0
);

export const coalesceAiViewportReduction = (current: number, next: number) => {
  const safeCurrent = normalizeViewportReduction(current);
  const safeNext = normalizeViewportReduction(next);
  const currentKeyboardVisible = safeCurrent > KEYBOARD_VISIBILITY_THRESHOLD;
  const nextKeyboardVisible = safeNext > KEYBOARD_VISIBILITY_THRESHOLD;
  return currentKeyboardVisible === nextKeyboardVisible ? safeCurrent : safeNext;
};

export interface AiKeyboardLayoutInput {
  nativeKeyboardHeight: number;
  visualViewportReduction: number;
  textareaFocused: boolean;
}

export interface AiKeyboardLayout {
  keyboardVisible: boolean;
  nativeOverlayInset: number;
}

export const resolveAiKeyboardLayout = ({
  nativeKeyboardHeight,
  visualViewportReduction,
  textareaFocused,
}: AiKeyboardLayoutInput): AiKeyboardLayout => {
  const safeNativeHeight = Number.isFinite(nativeKeyboardHeight)
    ? Math.max(0, nativeKeyboardHeight)
    : 0;
  const safeViewportReduction = normalizeViewportReduction(visualViewportReduction);
  const visualViewportResized = textareaFocused
    && safeViewportReduction > KEYBOARD_VISIBILITY_THRESHOLD;
  const nativeKeyboardVisible = safeNativeHeight > 0;

  return {
    keyboardVisible: nativeKeyboardVisible || visualViewportResized,
    // Capacitor KeyboardResize.None leaves the WebView at full height. In that
    // mode the native keyboard height must be applied as an overlay inset.
    // When visualViewport already shrank, applying it again would double-shift.
    nativeOverlayInset: nativeKeyboardVisible && !visualViewportResized
      ? safeNativeHeight
      : 0,
  };
};
