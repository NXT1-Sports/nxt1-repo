/**
 * @fileoverview Staging Environment Configuration
 * @module @nxt1/mobile
 *
 * This configuration is used for:
 * - Testing builds on staging server
 * - QA/UAT testing
 * - Pre-production validation
 */

export const environment = {
  production: false,
  appVersion: '1.1.0',

  // Staging API - accessible from anywhere via domain
  apiUrl: 'https://api.nxt1sports.com/api/v1/staging',

  // Web URL for shareable links — must be the public staging hostname so QR codes
  // and share links are resolvable on real devices.
  webUrl: 'https://nxt-1-staging-v2.web.app',

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
