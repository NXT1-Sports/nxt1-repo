/**
 * @fileoverview Production Environment Configuration
 * @module @nxt1/mobile
 */

export const environment = {
  production: true,
  appVersion: '2.0.0',
  apiUrl: 'https://backend.nxt1sports.com/api/v1',
  firebase: {
    apiKey: 'AIzaSyAg0ln9P4HxZkqRsOi8ceVDNz1YEXhmN9I',
    authDomain: 'nxt-1-v2.firebaseapp.com',
    projectId: 'nxt-1-v2',
    storageBucket: 'nxt-1-v2.firebasestorage.app',
    messagingSenderId: '112256620070',
    appId: '1:112256620070:web:6a758d6428d2222f2c78e7',
    measurementId: 'G-GZGSTY65KQ',
  },

  // iOS CLIENT_ID from GoogleService-Info.plist (production/ios)
  googleClientId: '112256620070-hhqncoijt5f2or5218dmtq43moa6vgup.apps.googleusercontent.com',

  // Web client ID (server-side verification)
  googleServerClientId: '112256620070-v6sa43846pdd27972btg8o82kj84aoap.apps.googleusercontent.com',
};
