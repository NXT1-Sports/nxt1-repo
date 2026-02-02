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
  appVersion: '2.0.0-staging',

  // Staging API - accessible from anywhere via domain
  apiUrl: 'https://backend.nxt1sports.com/api/v1/staging',

  // Firebase Staging Configuration
  firebase: {
    apiKey: 'AIzaSyDSwJsZTCXeUQ2qPPqrGHQjMwxksQ-fkvE',
    authDomain: 'nxt-1-staging.firebaseapp.com',
    projectId: 'nxt-1-staging',
    storageBucket: 'nxt-1-staging.appspot.com',
    messagingSenderId: '455734259010',
    appId: '1:455734259010:web:34d2571568094bb75a6cdb',
    measurementId: 'G-TH51Q9XZNB',
  },

  googleClientId: '455734259010-qagtsakkvchuf3tnbgjgitjj80e740ib.apps.googleusercontent.com',
  googleServerClientId: '455734259010-d04kqk9g2kkfov38t0lrdqcrlujtrsom.apps.googleusercontent.com',
};
