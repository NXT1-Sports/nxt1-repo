/**
 * Local Production-Account Development Environment Configuration
 *
 * Used for local frontend development against the local backend while
 * authenticating against the production Firebase project.
 */
export const environment = {
  production: false,
  appVersion: '1.97.0-local-prod',
  version: '1.97.0-local-prod',
  webUrl: 'http://localhost:4200',

  // Backend API URLs (Local Backend, Production data scope)
  apiURL: 'http://localhost:3000/api/v1',
  sentryDsn: '',
  loggingEndpoint: '',

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
  vapidKey:
    'BJs9El_buODK_TJbd8fuPvl-VhXXdXMeRd3PpfOgTKw_rwJmlE9g7f2Izw2kg7TBqn5CtQhqPENbMgtVwc8iuSg',

  // Third-party API Keys
  removeBgKey: 'sCyRfLKyXDS5ySnuXmEiqXpK',
  googleClientId: '112256620070-v6sa43846pdd27972btg8o82kj84aoap.apps.googleusercontent.com',
  msalConfig: {
    clientId: 'aaceb7d3-bc1d-4c44-a871-cb96826558de',
    authority: 'https://login.microsoftonline.com/common',
  },
  yahooClientId:
    'dj1yJmk9dml1QlJOTnpMSzNNJmQ9WVdrOVdsaGFUMjlJZVRVbWNHbzlNQT09JnM9Y29uc3VtZXJzZWNyZXQmc3Y9MCZ4PWE2',

  // Stripe publishable key (production live mode)
  stripePublishableKey:
    'pk_live_51MTwFLKBRB9aJio2J4N26ctBXnLKlt2Tw9nfsOf4nxpESY9ODakObjQpUuznFH4rQbuGRWYVOdquttj4fT3djE5U005EPYUTAE',
};
