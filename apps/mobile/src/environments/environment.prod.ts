// /**
//  * @fileoverview Production Environment Configuration
//  * @module @nxt1/mobile
//  */

// export const environment = {
//   production: true,
//   appVersion: '1.0.0',
//   apiUrl: 'http://34.72.3.113:8080/api/v1',

//   // Production web URL for shareable links
//   webUrl: 'https://nxt1sports.com',
//   firebase: {
//     apiKey: 'AIzaSyAg0ln9P4HxZkqRsOi8ceVDNz1YEXhmN9I',
//     authDomain: 'nxt-1-v2.firebaseapp.com',
//     projectId: 'nxt-1-v2',
//     storageBucket: 'nxt-1-v2.firebasestorage.app',
//     messagingSenderId: '112256620070',
//     appId: '1:112256620070:web:6a758d6428d2222f2c78e7',
//     measurementId: 'G-GZGSTY65KQ',
//   },

//   // iOS CLIENT_ID from GoogleService-Info.plist (production/ios)
//   googleClientId: '112256620070-hhqncoijt5f2or5218dmtq43moa6vgup.apps.googleusercontent.com',

//   // Web client ID (server-side verification)
//   googleServerClientId: '112256620070-v6sa43846pdd27972btg8o82kj84aoap.apps.googleusercontent.com',
//   msClientId: 'aaceb7d3-bc1d-4c44-a871-cb96826558de',
//   yahooClientId:
//     'dj1yJmk9dml1QlJOTnpMSzNNJmQ9WVdrOVdsaGFUMjlJZVRVbWNHbzlNQT09JnM9Y29uc3VtZXJzZWNyZXQmc3Y9MCZ4PWE2',
//   appScheme: 'nxt1sports',
// };

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
  appVersion: '1.0.0',

  // Staging API - accessible from anywhere via domain
  apiUrl: 'https://api.nxt1sports.com/api/v1/staging',

  // Web URL for shareable links (using localhost for staging tests)
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
