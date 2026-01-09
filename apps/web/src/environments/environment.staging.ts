/**
 * Staging Environment Configuration
 *
 * Used for staging builds deployed to staging.nxt1sports.com
 */
export const environment = {
  production: false,
  appVersion: '2.0.0-staging',

  // Backend API URLs (Staging)
  apiURL: 'https://staging-backend.nxt1sports.com/v1',
  apiPaymentURL: 'https://staging-backend.nxt1sports.com/v1',
  profileSsrUrl: 'https://staging-profile.nxt1sports.com/v1/ssr',
  userPostSsrUrl: 'https://staging-post.nxt1sports.com/v1/ssr',

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
  googleClientId:
    '574223545656-od13fibpirieo8hqmlk1ajhpvqs9vp60.apps.googleusercontent.com',
};
