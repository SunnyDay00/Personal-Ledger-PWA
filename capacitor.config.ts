import type { CapacitorConfig } from '@capacitor/cli';
import { KeyboardResize } from '@capacitor/keyboard';

const config: CapacitorConfig = {
  appId: 'com.personal.ledger.pwa',
  appName: 'Personal Ledger',
  webDir: 'dist',
  plugins: {
    Keyboard: {
      resize: KeyboardResize.None,
      resizeOnFullScreen: true,
    },
  },
};

export default config;
