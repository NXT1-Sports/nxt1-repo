/**
 * @fileoverview Push Notification Handler Service
 * @module @nxt1/mobile/core
 *
 * Handles incoming push notifications on mobile:
 * - **Foreground**: Shows in-app toast with "View" action + haptic feedback
 * - **Background**: Routes to the correct deep link when user taps notification
 *
 * Integrates with:
 * - Capacitor PushNotifications plugin for native FCM handling
 * - ActivityService for badge count updates
 * - NavController for Ionic-native navigation
 * - Analytics for push engagement tracking
 *
 * Usage:
 * ```typescript
 * // In app.component.ts afterNextRender
 * await this.pushHandler.initialize();
 * ```
 */

import { Injectable, inject, PLATFORM_ID, NgZone, signal, computed } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { NavController, Platform } from '@ionic/angular/standalone';
import {
  HapticsService,
  NxtToastService,
  NxtLoggingService,
  NxtBreadcrumbService,
  ANALYTICS_ADAPTER,
} from '@nxt1/ui';
import type { ILogger } from '@nxt1/core/logging';
import { APP_EVENTS } from '@nxt1/core/analytics';
import { ActivityService } from '../../features/activity/services';
import { AgentXService } from '../../features/agent-x/services';

/**
 * Push notification data payload from FCM (passed through Cloud Function).
 */
interface PushData {
  readonly type?: string;
  readonly deepLink?: string;
  readonly sessionId?: string;
  readonly operationId?: string;
  readonly imageUrl?: string;
  readonly title?: string;
  readonly body?: string;
}

@Injectable({ providedIn: 'root' })
export class PushHandlerService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly ionicPlatform = inject(Platform);
  private readonly navController = inject(NavController);
  private readonly ngZone = inject(NgZone);
  private readonly haptics = inject(HapticsService);
  private readonly toast = inject(NxtToastService);
  private readonly breadcrumbs = inject(NxtBreadcrumbService);
  private readonly analytics = inject(ANALYTICS_ADAPTER, { optional: true });
  private readonly activityService = inject(ActivityService);
  private readonly agentX = inject(AgentXService);
  private readonly logger: ILogger = inject(NxtLoggingService).child('PushHandlerService');

  // ============================================
  // STATE
  // ============================================

  private readonly _isInitialized = signal(false);
  private readonly _unreadPushCount = signal(0);

  /** Whether push handling is initialized */
  readonly isInitialized = computed(() => this._isInitialized());

  /** Count of unread push notifications received in foreground */
  readonly unreadPushCount = computed(() => this._unreadPushCount());

  // ============================================
  // INITIALIZATION
  // ============================================

  /**
   * Initialize push notification listeners.
   * Call in app.component.ts afterNextRender().
   */
  async initialize(): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) return;
    if (this._isInitialized()) {
      this.logger.debug('Already initialized');
      return;
    }

    await this.ionicPlatform.ready();

    if (!this.ionicPlatform.is('capacitor')) {
      this.logger.debug('Not on native — push handler skipped');
      this._isInitialized.set(true);
      return;
    }

    await this.setupListeners();
    this._isInitialized.set(true);
    this.logger.info('Push handler initialized');
  }

  // ============================================
  // LISTENER SETUP
  // ============================================

  /**
   * Set up Capacitor PushNotifications listeners for foreground + background.
   */
  private async setupListeners(): Promise<void> {
    try {
      const { PushNotifications } = await import('@capacitor/push-notifications');

      // Foreground: notification arrives while user is in-app
      PushNotifications.addListener('pushNotificationReceived', (notification) => {
        this.ngZone.run(() => {
          this.handleForegroundPush(notification);
        });
      });

      // Background: user tapped notification from OS tray
      PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
        this.ngZone.run(() => {
          this.handleBackgroundTap(action);
        });
      });

      this.logger.debug('Push notification listeners configured');
    } catch (error) {
      this.logger.error('Failed to set up push listeners', error);
    }
  }

  // ============================================
  // FOREGROUND HANDLER
  // ============================================

  /**
   * Handle a push notification received while the app is in the foreground.
   * Shows an in-app toast with optional "View" action instead of an OS notification.
   */
  private handleForegroundPush(notification: {
    title?: string;
    body?: string;
    data?: Record<string, unknown>;
  }): void {
    const data = this.extractPushData(notification.data);
    const title = notification.title ?? data.title ?? 'Agent X';
    const body = notification.body ?? data.body ?? 'Task completed';

    this.logger.info('Foreground push received', {
      type: data.type,
      sessionId: data.sessionId,
    });

    void this.breadcrumbs.trackUserAction('Push foreground received', {
      type: data.type,
    });

    this.analytics?.trackEvent(APP_EVENTS.PUSH_FOREGROUND_RECEIVED, {
      type: data.type,
      hasDeepLink: !!data.deepLink,
    });

    // Increment badge on the agent tab
    this.activityService.incrementBadge('agent');
    this._unreadPushCount.update((c) => c + 1);

    // Haptic tap for attention
    void this.haptics.notification('success');

    // Agent notifications with media (welcome graphic, generated content, etc.) —
    // auto-inject into Agent X chat and navigate directly.
    if (this.isAgentMediaNotification(data)) {
      this.injectAgentMessage({
        content: body,
        imageUrl: data.imageUrl,
        source: 'foreground_push',
      });

      void this.navController.navigateForward('/agent');
      return;
    }

    // Show toast with "View" action if there's a deep link
    if (data.deepLink) {
      this.toast.show({
        message: `${title}: ${body}`,
        duration: 5000,
        position: 'top',
        action: {
          text: 'View',
          handler: () => {
            this.analytics?.trackEvent(APP_EVENTS.PUSH_FOREGROUND_ACTION, {
              type: data.type,
              deepLink: data.deepLink,
            });
            void this.navigateToDeepLink(data.deepLink!);
          },
        },
      });
    } else {
      this.toast.show({
        message: `${title}: ${body}`,
        duration: 4000,
        position: 'top',
      });
    }
  }

  // ============================================
  // BACKGROUND TAP HANDLER
  // ============================================

  /**
   * Handle user tapping a push notification from the OS tray (background/killed).
   * Routes to the deep link embedded in the notification data.
   */
  private handleBackgroundTap(action: {
    notification: {
      title?: string;
      body?: string;
      data?: Record<string, unknown>;
    };
    actionId: string;
  }): void {
    const data = this.extractPushData(action.notification.data);

    this.logger.info('Background push tapped', {
      type: data.type,
      actionId: action.actionId,
      deepLink: data.deepLink,
    });

    void this.breadcrumbs.trackUserAction('Push background tapped', {
      type: data.type,
      actionId: action.actionId,
    });

    this.analytics?.trackEvent(APP_EVENTS.PUSH_BACKGROUND_OPENED, {
      type: data.type,
      actionId: action.actionId,
      hasDeepLink: !!data.deepLink,
    });

    // Agent notifications with media — inject into chat before navigating
    if (this.isAgentMediaNotification(data)) {
      const body = action.notification.body ?? 'Agent X completed your request.';
      this.injectAgentMessage({
        content: body,
        imageUrl: data.imageUrl,
        source: 'background_push',
      });

      void this.navController.navigateForward('/agent');
      return;
    }

    if (data.deepLink) {
      void this.navigateToDeepLink(data.deepLink);
    } else {
      // Fallback: open activity page on agent tab
      void this.navController.navigateForward('/activity');
    }
  }

  // ============================================
  // NAVIGATION
  // ============================================

  /**
   * Navigate to a deep link route.
   * Handles agent-x chat threads and generic routes.
   */
  private async navigateToDeepLink(deepLink: string): Promise<void> {
    try {
      // Normalize deep links: web uses /agent-x, mobile uses /agent
      const normalizedLink = deepLink.replace(/^\/agent-x(\/|$)/, '/agent$1');

      this.logger.info('Navigating to push deep link', { deepLink, normalizedLink });
      void this.breadcrumbs.trackNavigation('push-notification', normalizedLink);

      // NavController handles Ionic page transitions
      await this.navController.navigateForward(normalizedLink);
    } catch (error) {
      this.logger.error('Failed to navigate from push', error, { deepLink });
      // Fallback to activity
      await this.navController.navigateForward('/activity');
    }
  }

  // ============================================
  // HELPERS
  // ============================================

  /**
   * Safely extract typed push data from the raw notification data object.
   */
  private extractPushData(raw?: Record<string, unknown>): PushData {
    if (!raw) return {};
    return {
      type: typeof raw['type'] === 'string' ? raw['type'] : undefined,
      deepLink: typeof raw['deepLink'] === 'string' ? raw['deepLink'] : undefined,
      sessionId: typeof raw['sessionId'] === 'string' ? raw['sessionId'] : undefined,
      operationId: typeof raw['operationId'] === 'string' ? raw['operationId'] : undefined,
      imageUrl: typeof raw['imageUrl'] === 'string' ? raw['imageUrl'] : undefined,
      title: typeof raw['title'] === 'string' ? raw['title'] : undefined,
      body: typeof raw['body'] === 'string' ? raw['body'] : undefined,
    };
  }

  // ============================================
  // AGENT MEDIA HELPERS
  // ============================================

  /**
   * Check if a push notification is an agent-originated notification with media.
   * Purely data-driven — works for any current or future agent notification type
   * as long as it carries an imageUrl and a deep link pointing to the agent.
   */
  private isAgentMediaNotification(data: PushData): boolean {
    return !!(data.imageUrl && data.deepLink && data.deepLink.includes('agent'));
  }

  /**
   * Inject an agent message (with optional image) into the Agent X chat.
   * Reusable for any agent notification — welcome, generated graphics,
   * scout reports, or any future media the agent produces.
   */
  private injectAgentMessage(opts: { content: string; imageUrl?: string; source: string }): void {
    this.agentX.pushMessage({
      role: 'assistant',
      content: opts.content,
      ...(opts.imageUrl ? { imageUrl: opts.imageUrl } : {}),
    });

    this.analytics?.trackEvent(APP_EVENTS.AGENT_MEDIA_VIEWED, {
      source: opts.source,
      hasImage: !!opts.imageUrl,
    });
  }
}
