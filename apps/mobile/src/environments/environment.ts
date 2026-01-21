/**
 * @fileoverview Development Environment Configuration
 * @module @nxt1/mobile
 */

export const environment = {
  production: false,
  appVersion: '2.0.0-dev',
  // Use staging API path to match staging Firebase project
  apiUrl: 'http://localhost:3000/api/v1/staging',
  firebase: {
    apiKey: 'AIzaSyDSwJsZTCXeUQ2qPPqrGHQjMwxksQ-fkvE',
    authDomain: 'nxt-1-staging.firebaseapp.com',
    projectId: 'nxt-1-staging',
    storageBucket: 'nxt-1-staging.appspot.com',
    messagingSenderId: '455734259010',
    appId: '1:455734259010:web:34d2571568094bb75a6cdb',
    measurementId: 'G-TH51Q9XZNB',
  },
  googleClientId: '574223545656-od13fibpirieo8hqmlk1ajhpvqs9vp60.apps.googleusercontent.com',
};
