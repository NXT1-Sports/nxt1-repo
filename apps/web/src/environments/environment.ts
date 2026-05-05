/**
 * Development Environment Configuration
 *
 * Used for local development with staging Firebase project.
 * Backend runs locally at localhost:80
 */
export const environment = {
  production: false,
  appVersion: '1.7.0-dev',
  version: '1.7.0-dev',
  webUrl: 'http://localhost:4200',

  // Backend API URLs (Local Development)
  apiURL: 'http://localhost:3000/api/v1/staging',
  sentryDsn: '', // Empty in dev - no Sentry
  loggingEndpoint: '', // No remote logging in local development

  // Firebase Configuration (Staging)
  firebase: {
    apiKey: 'AIzaSyAibi8BmikNNMLF5Q2jApntx1qrHpQcT9M',
    authDomain: 'nxt-1-staging-v2.firebaseapp.com',
    projectId: 'nxt-1-staging-v2',
    storageBucket: 'nxt-1-staging-v2.firebasestorage.app',
    messagingSenderId: '1099429444442',
    appId: '1:1099429444442:web:15c8b8a5d7f26883b09163',
    measurementId: 'G-7C1JQW72JX',
  },

  // Firebase Cloud Messaging VAPID key (staging)
  vapidKey:
    'BC5fKEF639Tg0ndkwK5VxuL8_hTfRYP19WIJVU6WV8rXDcAKzD5KOpl7M8hGaRruWniUqi2DsaFB6WASUZ03TYQ',

  // Third-party API Keys
  removeBgKey: 'sCyRfLKyXDS5ySnuXmEiqXpK',
  googleClientId: '1099429444442-v8mlmoiu6kc27nhdl661d12te7cg2j4h.apps.googleusercontent.com',
  msalConfig: {
    clientId: 'aaceb7d3-bc1d-4c44-a871-cb96826558de',
    authority: 'https://login.microsoftonline.com/common',
  },
  yahooClientId:
    'dj1yJmk9dml1QlJOTnpMSzNNJmQ9WVdrOVdsaGFUMjlJZVRVbWNHbzlNQT09JnM9Y29uc3VtZXJzZWNyZXQmc3Y9MCZ4PWE2',

  // Stripe publishable key (dev uses staging/test key)
  stripePublishableKey:
    'pk_test_51THcNAK4cVDETfc6IECX633oV4RY3jq3jIyqhdfA3v7oaAMBs0mdtZkFgGlNIBbGTezA80cXdVHNxyy8H1jS6i1j00PBsMGQmN',
};
