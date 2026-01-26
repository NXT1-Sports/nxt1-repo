/**
 * @fileoverview Development Environment Configuration
 * @module @nxt1/mobile
 */

export const environment = {
  production: false,
  appVersion: '2.0.0-dev',
  // Use your Mac's IP address for physical device testing
  // Your iPhone must be on the same WiFi network
  apiUrl: 'http://192.168.1.127:3000/api/v1/staging',
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
