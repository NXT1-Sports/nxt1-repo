/**
 * Production Environment Configuration
 *
 * Used for production builds deployed to nxt1sports.com
 */
export const environment = {
  production: true,
  appVersion: '2.0.0',

  // Backend API URLs (Production)
  apiURL: 'https://backend.nxt1sports.com/v1',
  apiPaymentURL: 'https://backend.nxt1sports.com/v1',
  profileSsrUrl: 'https://profile.nxt1sports.com/v1/ssr',
  userPostSsrUrl: 'https://post.nxt1sports.com/v1/ssr',

  // Firebase Configuration (Production)
  firebase: {
    apiKey: 'AIzaSyCFhuwGzzza5VbrXCJ_5_l8EisCkZKzoow',
    authDomain: 'nxt1sports.com',
    projectId: 'nxt-1-de054',
    storageBucket: 'nxt-1-de054.appspot.com',
    messagingSenderId: '574223545656',
    appId: '1:574223545656:web:35d717a721f4b84a45bdcd',
    measurementId: 'G-SNZ2T18P5G',
  },

  // Third-party API Keys
  removeBgKey: 'sCyRfLKyXDS5ySnuXmEiqXpK',
  googleClientId: '574223545656-od13fibpirieo8hqmlk1ajhpvqs9vp60.apps.googleusercontent.com',
};
