// /**
//  * @fileoverview Production Environment Configuration
//  * @module @nxt1/mobile
//  */

// export const environment = {
//   production: true,
//   appVersion: '1.1.0',
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
//     measurementId: 'G-SNZ2T18P5G',
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
 * @fileoverview Production Environment Configuration
 * @module @nxt1/mobile
 */

export const environment = {
  production: true,
  appVersion: '1.1.0',

  // Production API
  apiUrl: 'https://api.nxt1sports.com/api/v1',

  // Production web URL for shareable links
  webUrl: 'https://nxt1sports.com',

  // Firebase Production Configuration (nxt-1-v2)
  firebase: {
    apiKey: 'AIzaSyAg0ln9P4HxZkqRsOi8ceVDNz1YEXhmN9I',
    authDomain: 'nxt-1-v2.firebaseapp.com',
    projectId: 'nxt-1-v2',
    storageBucket: 'nxt-1-v2.firebasestorage.app',
    messagingSenderId: '112256620070',
    appId: '1:112256620070:web:6a758d6428d2222f2c78e7',
    measurementId: 'G-SNZ2T18P5G',
  },

  // iOS CLIENT_ID from GoogleService-Info.plist (production/ios)
  googleClientId: '112256620070-hhqncoijt5f2or5218dmtq43moa6vgup.apps.googleusercontent.com',

  // Web client ID (server-side verification)
  googleServerClientId: '112256620070-v6sa43846pdd27972btg8o82kj84aoap.apps.googleusercontent.com',
  msClientId: 'aaceb7d3-bc1d-4c44-a871-cb96826558de',
  yahooClientId:
    'dj1yJmk9dml1QlJOTnpMSzNNJmQ9WVdrOVdsaGFUMjlJZVRVbWNHbzlNQT09JnM9Y29uc3VtZXJzZWNyZXQmc3Y9MCZ4PWE2',
  appScheme: 'nxt1sports',
};
