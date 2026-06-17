/**
 * Firebase Cloud Messaging Service Worker
 *
 * Handles background push notifications when the web app is not focused.
 * This file must be served from the root of the domain.
 *
 * The Firebase config is injected at runtime via the `messagingSenderId`
 * from the main app — see WebPushService for foreground handling.
 *
 * @see https://firebase.google.com/docs/cloud-messaging/js/receive
 */

/* eslint-disable no-undef */
importScripts('https://www.gstatic.com/firebasejs/12.9.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/12.9.0/firebase-messaging-compat.js');

/**
 * The messaging SDK must be initialized during the worker's initial script
 * evaluation. If it is initialized later from a message callback, Chrome warns
 * that push-related event listeners were attached too late and web push
 * reliability can degrade.
 */

const STAGING_FIREBASE_CONFIG = {
  apiKey: 'AIzaSyAibi8BmikNNMLF5Q2jApntx1qrHpQcT9M',
  authDomain: 'nxt-1-staging-v2.firebaseapp.com',
  projectId: 'nxt-1-staging-v2',
  storageBucket: 'nxt-1-staging-v2.firebasestorage.app',
  messagingSenderId: '1099429444442',
  appId: '1:1099429444442:web:15c8b8a5d7f26883b09163',
  measurementId: 'G-7C1JQW72JX',
};

const PRODUCTION_FIREBASE_CONFIG = {
  apiKey: 'AIzaSyAg0ln9P4HxZkqRsOi8ceVDNz1YEXhmN9I',
  authDomain: 'nxt-1-v2.firebaseapp.com',
  projectId: 'nxt-1-v2',
  storageBucket: 'nxt-1-v2.firebasestorage.app',
  messagingSenderId: '112256620070',
  appId: '1:112256620070:web:6a758d6428d2222f2c78e7',
  measurementId: 'G-GZGSTY65KQ',
};

function isStagingHostname(hostname) {
  const normalized = String(hostname || '').toLowerCase();
  return (
    normalized === 'localhost' ||
    normalized === '127.0.0.1' ||
    normalized.includes('staging') ||
    normalized.includes('nxt-1-staging-v2')
  );
}

const firebaseConfig = isStagingHostname(self.location.hostname)
  ? STAGING_FIREBASE_CONFIG
  : PRODUCTION_FIREBASE_CONFIG;

if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

firebase.messaging();

/**
 * Handle background notification display.
 *
 * When the browser receives a push while the page is not focused,
 * this handler fires. We extract title/body/deepLink from the FCM
 * data payload and show a native OS notification.
 */
self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    return;
  }

  // FCM can send notification+data or data-only messages.
  // Our Cloud Function sends both, so prefer the notification field.
  const notification = payload.notification ?? {};
  const data = payload.data ?? {};

  const title = notification.title || data.title || 'NXT1 Sports';
  const body = notification.body || data.body || '';

  const options = {
    body,
    icon: '/assets/icons/icon-196x196.png',
    badge: '/assets/icons/icon-72x72.png',
    tag: data.type || 'nxt1-notification',
    data: {
      deepLink: data.deepLink || '/',
      type: data.type || '',
    },
    // Vibrate pattern: 200ms on, 100ms off, 200ms on
    vibrate: [200, 100, 200],
    // Renotify so same-tag notifications still vibrate
    renotify: true,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

/**
 * Handle notification click — navigate to deep link.
 */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const deepLink = event.notification.data?.deepLink || '/activity';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // If a window is already open, focus it and navigate
      for (const client of clientList) {
        if ('focus' in client) {
          client.focus();
          // Message type shared with WebPushService (web-push.service.ts)
          client.postMessage({
            type: 'NOTIFICATION_CLICK',
            deepLink,
          });
          return;
        }
      }

      // No existing window — open a new one
      return self.clients.openWindow(deepLink);
    })
  );
});
