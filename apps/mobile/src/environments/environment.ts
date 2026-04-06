/**
 * @fileoverview Development Environment Configuration
 * @module @nxt1/mobile
 *
 * ⚠️ AUTO-GENERATED SECTION BELOW - IP is injected by scripts/detect-local-ip.js
 *
 * AUTOMATIC IP DETECTION:
 * - IP is auto-detected by running: npm run detect:ip
 * - Automatically runs before dev builds (npm run dev, ios:dev, android:dev)
 * - No manual configuration needed - works for all teammates
 *
 * BACKEND OPTIONS:
 * 1. Local backend: Uses auto-detected IP (default for environment.ts)
 * 2. Staging backend: Run npm run dev:staging (uses domain)
 * 3. Production backend: Run npm run build (uses production domain)
 */

// AUTO-GENERATED: Do not edit this line - updated by detect-local-ip.js
const DETECTED_LOCAL_IP = '10.2.15.39';

export const environment = {
  production: false,
  appVersion: '1.0.0-dev',

  // Development API - Local backend
  apiUrl: `http://${DETECTED_LOCAL_IP}:3000/api/v1/staging`,

  // Web URL for shareable links (profile, team, post URLs)
  webUrl: 'http://localhost:4300',

  // Firebase Staging Configuration (nxt-1-staging-v2)
  firebase: {
    apiKey: 'AIzaSyDavayHwEACTQjg1KQKYofDScMMH4y1ViM',
    authDomain: 'nxt-1-staging-v2.firebaseapp.com',
    projectId: 'nxt-1-staging-v2',
    storageBucket: 'nxt-1-staging-v2.firebasestorage.app',
    messagingSenderId: '1099429444442',
    appId: '1:1099429444442:web:15c8b8a5d7f26883b09163',
    measurementId: 'G-7C1JQW72JX',
  },

  googleClientId: '1099429444442-n4nnpevnqm8on4dp91il0f6rl39e3nvs.apps.googleusercontent.com',
  googleServerClientId: '1099429444442-v8mlmoiu6kc27nhdl661d12te7cg2j4h.apps.googleusercontent.com',
  msClientId: 'aaceb7d3-bc1d-4c44-a871-cb96826558de',
  yahooClientId:
    'dj1yJmk9dml1QlJOTnpMSzNNJmQ9WVdrOVdsaGFUMjlJZVRVbWNHbzlNQT09JnM9Y29uc3VtZXJzZWNyZXQmc3Y9MCZ4PWE2',
  appScheme: 'nxt1sports',
};
