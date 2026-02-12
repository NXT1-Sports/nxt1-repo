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
const DETECTED_LOCAL_IP = '192.168.1.131';

export const environment = {
  production: false,
  appVersion: '2.0.0-dev',

  // Development API - Uses auto-detected IP for local backend
  apiUrl: `http://${DETECTED_LOCAL_IP}:3000/api/v1/staging`,

  // Firebase Staging Configuration
  firebase: {
    apiKey: 'AIzaSyDSwJsZTCXeUQ2qPPqrGHQjMwxksQ-fkvE',
    authDomain: 'nxt-1-staging.firebaseapp.com',
    projectId: 'nxt-1-staging',
    storageBucket: 'nxt-1-staging.appspot.com',
    messagingSenderId: '455734259010',
    appId: '1:455734259010:web:34d2571568094bb75a6cdb',
    measurementId: 'G-TH51Q9XZNB',
  },

  googleClientId: '455734259010-qagtsakkvchuf3tnbgjgitjj80e740ib.apps.googleusercontent.com',
  googleServerClientId: '455734259010-d04kqk9g2kkfov38t0lrdqcrlujtrsom.apps.googleusercontent.com',
};
