/**
 * @fileoverview Web Push Notification Service
 * @module @nxt1/web/core/services
 * @version 1.0.0
 *
 * Handles web push notification lifecycle:
 * 1. Permission request and FCM token acquisition
 * 2. Foreground message handling (in-app toast)
 * 3. Background click deep-link navigation
 * 4. Token registration with Cloud Function
 * 5. Token refresh on revisit
 *
 * SSR-safe — all browser APIs guarded with isPlatformBrowser.
 *
 * @example
 * ```typescript
 * // app.config.ts
 * import { provideWebPush } from './core/services/web-push.service';
 *
 * providers: [provideWebPush()]
 * ```
 */

import {
  Injectable,
  inject,
  signal,
  computed,
  effect,
  PLATFORM_ID,
  NgZone,
  Injector,
  makeEnvironmentProviders,
  ENVIRONMENT_INITIALIZER,
  type EnvironmentProviders,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Router } from '@angular/router';
import { NxtLoggingService } from '@nxt1/ui/services/logging';
import { NxtBreadcrumbService } from '@nxt1/ui/services/breadcrumb';
import { NxtToastService } from '@nxt1/ui/services/toast';
import { ANALYTICS_ADAPTER } from '@nxt1/ui/services/analytics';
import { APP_EVENTS } from '@nxt1/core/analytics';
import { AUTH_SERVICE } from '../../features/auth';
import { environment } from '../../../environments/environment';

/**
 * Web Push Notification Service.
 *
 * Manages the full lifecycle of web push: permission → token → register → receive.
 * Lazy-loads Firebase Messaging SDK to avoid impacting main bundle size.
 */
@Injectable({ providedIn: 'root' })
export class WebPushService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly router = inject(Router);
  private readonly zone = inject(NgZone);
  private readonly auth = inject(AUTH_SERVICE);
  private readonly toast = inject(NxtToastService);
  private readonly logger = inject(NxtLoggingService).child('WebPushService');
  private readonly breadcrumb = inject(NxtBreadcrumbService);
  private readonly analytics = inject(ANALYTICS_ADAPTER, { optional: true });

  // ============================================
  // STATE
  // ============================================

  private readonly _permissionState = signal<NotificationPermission | 'unsupported'>('default');
  private readonly _token = signal<string | null>(null);
  private readonly _isRegistering = signal(false);

  /** Current notification permission state */
  readonly permissionState = computed(() => this._permissionState());

  /** Whether push is currently enabled (permission granted + token acquired) */
  readonly isEnabled = computed(
    () => this._permissionState() === 'granted' && this._token() !== null
  );

  /** Whether a token registration is in progress */
  readonly isRegistering = computed(() => this._isRegistering());

  /** Whether the browser supports push notifications */
  readonly isSupported = computed(() => this._permissionState() !== 'unsupported');

  // Lazy-loaded Firebase instances
  private messagingInstance: unknown = null;
  private firebaseApp: unknown = null;

  // ============================================
  // INITIALIZATION
  // ============================================

  /**
   * Initialize web push.
   * Called once from the ENVIRONMENT_INITIALIZER.
   * - Checks browser support
   * - If already granted, silently acquires token
   * - Listens for foreground messages
   * - Listens for background notification clicks
   */
  async initialize(): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) return;

    // Check basic support
    if (!('Notification' in window) || !('serviceWorker' in navigator)) {
      this._permissionState.set('unsupported');
      this.logger.info('Push notifications not supported in this browser');
      return;
    }

    // Read current permission
    this._permissionState.set(Notification.permission);

    // Listen for background notification clicks forwarded by the service worker
    // Message type shared with firebase-messaging-sw.js
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data?.type === 'NOTIFICATION_CLICK') {
        this.zone.run(() => {
          const deepLink = event.data.deepLink || '/activity';
          this.logger.info('Background notification clicked', { deepLink });
          this.breadcrumb.trackUserAction('push:background-click', { deepLink });
          this.analytics?.trackEvent(APP_EVENTS.PUSH_BACKGROUND_OPENED, { deepLink });
          this.router.navigateByUrl(deepLink);
        });
      }
    });

    // If permission was already granted, silently set up messaging
    if (Notification.permission === 'granted') {
      await this.setupMessaging();
    }
  }

  // ============================================
  // PUBLIC API
  // ============================================

  /**
   * Request notification permission and register FCM token.
   * Call this from a user action (button click) for best UX.
   *
   * @returns true if permission was granted and token registered
   */
  async requestPermission(): Promise<boolean> {
    if (!isPlatformBrowser(this.platformId)) return false;
    if (this._permissionState() === 'unsupported') return false;

    // Already granted — just ensure token is registered
    if (Notification.permission === 'granted') {
      if (!this._token()) {
        return this.setupMessaging();
      }
      return true;
    }

    this.logger.info('Requesting push notification permission');
    this.breadcrumb.trackUserAction('push:permission-request');

    try {
      const permission = await Notification.requestPermission();
      this._permissionState.set(permission);

      if (permission === 'granted') {
        this.analytics?.trackEvent(APP_EVENTS.PUSH_PERMISSION_GRANTED);
        this.logger.info('Push permission granted');
        return this.setupMessaging();
      }

      this.analytics?.trackEvent(APP_EVENTS.PUSH_PERMISSION_DENIED);
      this.logger.info('Push permission denied');
      return false;
    } catch (err) {
      this.logger.error('Failed to request push permission', err);
      return false;
    }
  }

  // ============================================
  // PRIVATE
  // ============================================

  /**
   * Lazy-load Firebase Messaging, acquire FCM token, register with backend,
   * and set up foreground message listener.
   */
  private async setupMessaging(): Promise<boolean> {
    if (this._isRegistering()) return false;
    this._isRegistering.set(true);

    try {
      // Lazy-load Firebase Messaging SDK (avoids bloating initial bundle)
      const [{ initializeApp, getApps, getApp }, { getMessaging, getToken, onMessage }] =
        await Promise.all([import('firebase/app'), import('firebase/messaging')]);

      // Reuse existing Firebase app if already initialized
      this.firebaseApp = getApps().length > 0 ? getApp() : initializeApp(environment.firebase);

      this.messagingInstance = getMessaging(this.firebaseApp as ReturnType<typeof initializeApp>);

      // Register custom service worker for FCM
      const swRegistration = await navigator.serviceWorker.register('/firebase-messaging-sw.js', {
        scope: '/firebase-cloud-messaging-push-scope',
      });

      // Send Firebase config to the service worker (message type shared with firebase-messaging-sw.js)
      if (swRegistration.active) {
        swRegistration.active.postMessage({
          type: 'FIREBASE_CONFIG',
          config: environment.firebase,
        });
      }

      // Acquire FCM token
      const token = await getToken(this.messagingInstance as ReturnType<typeof getMessaging>, {
        vapidKey: environment.vapidKey,
        serviceWorkerRegistration: swRegistration,
      });

      if (!token) {
        this.logger.warn('FCM getToken returned empty');
        return false;
      }

      this._token.set(token);
      this.logger.info('FCM token acquired');

      // Register token with backend via Cloud Function
      await this.registerToken(token);

      // Listen for foreground messages
      onMessage(this.messagingInstance as ReturnType<typeof getMessaging>, (payload) => {
        this.zone.run(() => this.handleForegroundMessage(payload));
      });

      return true;
    } catch (err) {
      this.logger.error('Failed to set up web push messaging', err);
      this.analytics?.trackEvent(APP_EVENTS.PUSH_TOKEN_FAILED, {
        error: err instanceof Error ? err.message : 'unknown',
      });
      return false;
    } finally {
      this._isRegistering.set(false);
    }
  }

  /**
   * Register the FCM token with the backend via the Cloud Function callable.
   * Falls back to logging if registration fails (non-blocking).
   */
  private async registerToken(token: string): Promise<void> {
    try {
      const { getFunctions, httpsCallable } = await import('firebase/functions');
      const functions = getFunctions(this.firebaseApp as Parameters<typeof getFunctions>[0]);
      const registerFn = httpsCallable(functions, 'registerFcmToken');
      await registerFn({ token, platform: 'web' });

      this.analytics?.trackEvent(APP_EVENTS.PUSH_TOKEN_REGISTERED, { platform: 'web' });
      this.logger.info('FCM token registered with backend');
    } catch (err) {
      // Non-blocking — token will be re-registered on next visit
      this.logger.warn('Failed to register FCM token with backend', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /**
   * Handle a push notification received while the app is in the foreground.
   * Shows an in-app toast with a "View" action that navigates to the deep link.
   */
  private handleForegroundMessage(payload: {
    notification?: { title?: string; body?: string };
    data?: Record<string, string>;
  }): void {
    const title = payload.notification?.title ?? payload.data?.['title'] ?? 'New notification';
    const body = payload.notification?.body ?? payload.data?.['body'] ?? '';
    const deepLink = payload.data?.['deepLink'] || '/activity';

    this.logger.info('Foreground push received', {
      title,
      type: payload.data?.['type'],
    });

    this.analytics?.trackEvent(APP_EVENTS.PUSH_FOREGROUND_RECEIVED, {
      type: payload.data?.['type'] ?? 'unknown',
    });

    this.breadcrumb.trackStateChange('push:foreground-received', {
      type: payload.data?.['type'] ?? 'unknown',
    });

    // Show in-app toast with "View" action
    this.toast.show({
      message: `${title}${body ? ' — ' + body : ''}`,
      duration: 5000,
      position: 'top',
      action: {
        text: 'View',
        handler: () => {
          this.analytics?.trackEvent(APP_EVENTS.PUSH_FOREGROUND_ACTION, { deepLink });
          this.router.navigateByUrl(deepLink);
        },
      },
    });
  }
}

// ============================================
// PROVIDER FACTORY
// ============================================

/**
 * Provides WebPushService and runs initialization on app startup.
 *
 * @example
 * ```typescript
 * // app.config.ts
 * providers: [provideWebPush()]
 * ```
 */
export function provideWebPush(): EnvironmentProviders {
  return makeEnvironmentProviders([
    WebPushService,
    {
      provide: ENVIRONMENT_INITIALIZER,
      multi: true,
      useFactory: () => {
        const webPush = inject(WebPushService);
        const auth = inject(AUTH_SERVICE);
        const platformId = inject(PLATFORM_ID);
        const injector = inject(Injector);

        return () => {
          if (!isPlatformBrowser(platformId)) return;

          // Use effect() to reactively watch auth state.
          // Initializes push once when auth becomes initialized + authenticated.
          let initialized = false;

          effect(
            () => {
              const isReady = auth.isInitialized();
              const isLoggedIn = auth.isAuthenticated();

              if (!isReady || initialized) return;

              if (isLoggedIn) {
                initialized = true;
                webPush.initialize();
              }
            },
            { injector }
          );
        };
      },
    },
  ]);
}
