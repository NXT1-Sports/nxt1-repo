/**
 * Production Environment Configuration
 *
 * Used for production builds deployed to nxt1sports.com
 */
export const environment = {
  production: true,
  appVersion: '2.0.0',
  version: '2.0.0',

  // Backend API URLs (Production)
  apiURL: 'http://34.72.3.113:8080/api/v1',

  // Logging Configuration
  loggingEndpoint: 'http://34.72.3.113:8080/api/v1/logs', // Remote logging endpoint

  // Firebase Configuration (Production)
  firebase: {
    apiKey: 'AIzaSyAg0ln9P4HxZkqRsOi8ceVDNz1YEXhmN9I',
    authDomain: 'nxt-1-v2.firebaseapp.com',
    projectId: 'nxt-1-v2',
    storageBucket: 'nxt-1-v2.firebasestorage.app',
    messagingSenderId: '112256620070',
    appId: '1:112256620070:web:6a758d6428d2222f2c78e7',
    measurementId: 'G-GZGSTY65KQ',
  },

  // Firebase Cloud Messaging VAPID key (production)
  // TODO: Replace with production VAPID key from nxt-1-v2 project
  vapidKey:
    'BC5fKEF639Tg0ndkwK5VxuL8_hTfRYP19WIJVU6WV8rXDcAKzD5KOpl7M8hGaRruWniUqi2DsaFB6WASUZ03TYQ',

  // Third-party API Keys
  removeBgKey: 'sCyRfLKyXDS5ySnuXmEiqXpK',
  googleClientId: '112256620070-v6sa43846pdd27972btg8o82kj84aoap.apps.googleusercontent.com',
  msalConfig: {
    clientId: 'aaceb7d3-bc1d-4c44-a871-cb96826558de',
    authority: 'https://login.microsoftonline.com/common',
  },
  yahooClientId:
    'dj1yJmk9dml1QlJOTnpMSzNNJmQ9WVdrOVdsaGFUMjlJZVRVbWNHbzlNQT09JnM9Y29uc3VtZXJzZWNyZXQmc3Y9MCZ4PWE2',
};
