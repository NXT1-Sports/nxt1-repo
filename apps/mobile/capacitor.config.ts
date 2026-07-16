import type { CapacitorConfig } from '@capacitor/cli';
import { KeyboardResize, KeyboardStyle } from '@capacitor/keyboard';

// appId is resolved at build time via the BUILD_PLATFORM environment variable,
// which is injected by the CI/CD workflow before running `cap copy` / `cap sync`:
//   iOS     (BUILD_PLATFORM=ios)     → com.nxt1sports.nxt1
//   Android (BUILD_PLATFORM=android) → com.nxt1sports.app.twa
// Locally: set BUILD_PLATFORM before running cap commands, or it auto-detects
// from CLI args (e.g. `npx cap sync android` → android).
const cliArg = process.argv.find((a) => a === 'ios' || a === 'android');
const platform = process.env['BUILD_PLATFORM'] ?? cliArg;

const config: CapacitorConfig = {
  appId: platform === 'android' ? 'com.nxt1sports.app.twa' : 'com.nxt1sports.nxt1',
  appName: 'NXT1 Sports',
  webDir: 'www/browser',
  bundledWebRuntime: false,
  server: {
    androidScheme: 'https',
  },
  plugins: {
    CapacitorHttp: {
      enabled: false,
    },
    CapacitorUpdater: {
      autoUpdate: false,
      resetWhenUpdate: false,
      updateUrl: '',
      statsUrl: '',
      channelUrl: '',
      directUpdate: false,
      shakeMenu: false,
      appReadyTimeout: 10000,
    },
    FirebaseAuthentication: {
      skipNativeAuth: false,
      providers: ['apple.com', 'google.com', 'microsoft.com'],
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
    Keyboard: {
      resize: KeyboardResize.None,
      resizeOnFullScreen: true,
      style: KeyboardStyle.Default,
      // @ts-expect-error - Not yet added to types, but supported by the plugin
      scrollAssist: false,
      hideFormAccessoryBar: false,
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#0a0a0a',
      overlaysWebView: true,
    },
    AppLauncher: {
      iosScheme: 'nxt1sports',
      androidScheme: 'nxt1sports',
    },
  },
  ios: {
    contentInset: 'never',
    preferredContentMode: 'mobile',
    backgroundColor: '#0a0a0a',
    allowsLinkPreview: false,
  },
  android: {
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
  },
};

export default config;
