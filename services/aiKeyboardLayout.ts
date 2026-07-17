const KEYBOARD_VISIBILITY_THRESHOLD = 100;

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
  const safeViewportReduction = Number.isFinite(visualViewportReduction)
    ? Math.max(0, visualViewportReduction)
    : 0;
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
