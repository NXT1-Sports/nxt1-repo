/**
 * Development Environment Configuration
 *
 * Used for local development with staging Firebase project.
 * Backend runs locally at localhost:80
 */
export const environment = {
  production: false,
  appVersion: '2.0.0-dev',
  version: '2.0.0-dev',

  // Backend API URLs (Local Development)
  apiURL: 'http://localhost:3000/api/v1/staging',
  sentryDsn: '', // Empty in dev - no Sentry
  loggingEndpoint: 'http://localhost:3000/api/v1/staging/logs', // Remote logging endpoint

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

  // Third-party API Keys
  removeBgKey: 'sCyRfLKyXDS5ySnuXmEiqXpK',
  googleClientId: '1099429444442-v8mlmoiu6kc27nhdl661d12te7cg2j4h.apps.googleusercontent.com',
};
