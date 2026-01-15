/**
 * Development Environment Configuration
 *
 * Used for local development with staging Firebase project.
 * Backend runs locally at localhost:80
 */
export const environment = {
  production: false,
  appVersion: '2.0.0-dev',

  // Backend API URLs (Local Development)
  apiURL: 'http://localhost:3000/api/v1/staging',
  apiPaymentURL: 'http://localhost:3000/api/v1/staging',
  profileSsrUrl: 'http://localhost:3000/api/v1/staging/ssr',
  userPostSsrUrl: 'http://localhost:3000/api/v1/staging/ssr',

  // Firebase Configuration (Staging)
  firebase: {
    apiKey: 'AIzaSyDSwJsZTCXeUQ2qPPqrGHQjMwxksQ-fkvE',
    authDomain: 'nxt-1-staging.firebaseapp.com',
    projectId: 'nxt-1-staging',
    storageBucket: 'nxt-1-staging.appspot.com',
    messagingSenderId: '455734259010',
    appId: '1:455734259010:web:34d2571568094bb75a6cdb',
    measurementId: 'G-TH51Q9XZNB',
  },

  // Third-party API Keys
  removeBgKey: 'sCyRfLKyXDS5ySnuXmEiqXpK',
  googleClientId: '574223545656-od13fibpirieo8hqmlk1ajhpvqs9vp60.apps.googleusercontent.com',
};
