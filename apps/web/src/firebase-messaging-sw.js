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
 * Firebase configuration is passed from the client via `messagingSenderId`.
 * The compat SDK auto-initializes when the service worker receives a push
 * from the FCM backend. However, we must call `initializeApp` with at least
 * the `messagingSenderId` so the SDK can decode incoming push payloads.
 *
 * We listen for a one-time message from the client (WebPushService) that
 * contains the full Firebase config. Until that message arrives the SDK
 * falls back to the default `firebase-messaging-msg-type` header for
 * sender-id resolution — which works for data-only messages sent by our
 * Cloud Function.
 */

let messagingInitialized = false;

// Message type shared with WebPushService (web-push.service.ts)
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'FIREBASE_CONFIG' && !messagingInitialized) {
    firebase.initializeApp(event.data.config);
    firebase.messaging();
    messagingInitialized = true;
  }
});

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

  const deepLink = event.notification.data?.deepLink || '/';

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
