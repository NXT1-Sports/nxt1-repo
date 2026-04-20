/**
 * @fileoverview Badge Bridge Initializer
 * @module @nxt1/web/core/services
 * @version 2.0.0
 *
 * Connects the @nxt1/ui ActivityService badge counts to the local
 * BadgeCountService. This bridge exists because:
 *
 * 1. WebShellComponent reads from BadgeCountService (lightweight, no barrel import)
 * 2. ActivityService (@nxt1/ui) is the source of truth for notification counts
 * 3. This initializer creates a reactive effect that bridges the two
 *
 * Additionally, this bridge:
 * - Fetches badge counts on initial auth (so the red dot shows on first load)
 * - Polls for fresh badge counts every 60s while authenticated
 * - Pauses polling when the browser tab is hidden (Page Visibility API)
 * - Immediately refreshes when the tab becomes visible again
 * - Clears badges on sign-out
 *
 * Once @nxt1/ui is split into secondary entry points, this bridge can be
 * replaced by having ActivityService directly use a shared @nxt1/ui/badge service.
 *
 * Registration:
 * ```typescript
 * // app.config.ts
 * import { provideBadgeBridge } from './core/services';
 *
 * export const appConfig: ApplicationConfig = {
 *   providers: [
 *     provideBadgeBridge(),
 *     // ...
 *   ],
 * };
 * ```
 */

import {
  inject,
  effect,
  NgZone,
  makeEnvironmentProviders,
  ENVIRONMENT_INITIALIZER,
  PLATFORM_ID,
  type EnvironmentProviders,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { ActivityService } from '@nxt1/ui/activity';
import { NxtLoggingService } from '@nxt1/ui/services/logging';
import { BadgeCountService } from './badge-count.service';
import { AuthFlowService } from '../auth';

/** Badge polling interval: 60 seconds */
const BADGE_POLL_INTERVAL_MS = 60_000;

/**
 * Provides a bridge that syncs `ActivityService.totalUnread` → `BadgeCountService.activityBadge`.
 *
 * Runs as an `ENVIRONMENT_INITIALIZER` so the badge count is available
 * before any component renders. The `effect()` is reactive — any time
 * `ActivityService.totalUnread()` changes, `BadgeCountService` is updated.
 *
 * Also initiates badge fetching when the user authenticates and polls
 * every 60 seconds to keep the notification bell accurate.
 *
 * @returns EnvironmentProviders to register in app.config.ts
 */
export function provideBadgeBridge(): EnvironmentProviders {
  return makeEnvironmentProviders([
    {
      provide: ENVIRONMENT_INITIALIZER,
      multi: true,
      useValue: () => {
        const activityService = inject(ActivityService);
        const badges = inject(BadgeCountService);
        const authFlow = inject(AuthFlowService);
        const platformId = inject(PLATFORM_ID);
        const ngZone = inject(NgZone);
        const logger = inject(NxtLoggingService).child('BadgeBridge');

        // Reactive bridge: whenever ActivityService counts change, update BadgeCountService
        effect(() => {
          badges.setActivityBadge(activityService.totalUnread());
        });

        // Auth-aware badge lifecycle (browser only — skip during SSR)
        if (isPlatformBrowser(platformId)) {
          let pollTimer: ReturnType<typeof setInterval> | null = null;
          let isAuthed = false;
          let lastFetchTime = 0;

          const startPolling = (): void => {
            stopPolling();
            // Run outside NgZone: Zone.js tracks setInterval as a live macrotask.
            // A running interval inside the zone permanently prevents app stabilization.
            ngZone.runOutsideAngular(() => {
              pollTimer = setInterval(async () => {
                // Guard: skip if no valid auth token (avoids 401 on expired sessions)
                try {
                  const token = await authFlow.getIdToken();
                  if (!token) return;
                } catch {
                  return;
                }
                activityService.refreshBadges().catch(() => {
                  // Silent fail — will retry next interval
                });
              }, BADGE_POLL_INTERVAL_MS);
            });
          };

          const stopPolling = (): void => {
            if (pollTimer) {
              clearInterval(pollTimer);
              pollTimer = null;
            }
          };

          const fetchBadgesIfNeeded = async (): Promise<void> => {
            const now = Date.now();
            if (now - lastFetchTime < 2000) {
              logger.debug('Skipping badge fetch (too soon after previous fetch)');
              return;
            }
            try {
              const token = await authFlow.getIdToken();
              if (!token) {
                logger.debug('No auth token available yet, skipping badge fetch');
                return;
              }
            } catch (err) {
              logger.debug('Failed to get auth token, skipping badge fetch', { error: err });
              return;
            }

            lastFetchTime = now;
            activityService.refreshBadges().catch((err) => {
              logger.debug('Badge fetch failed (will retry on next poll)', err);
            });
          };

          // Visibility API: pause polling when tab is hidden,
          // resume polling when tab becomes visible.
          // (Discord / Slack / Twitter pattern)
          // Run outside NgZone: event listener callbacks re-enter the zone on
          // every visibility change, creating spurious change detection cycles.
          ngZone.runOutsideAngular(() =>
            document.addEventListener('visibilitychange', () => {
              if (!isAuthed) return;

              if (document.visibilityState === 'visible') {
                logger.debug('Tab visible, resuming badge polling');
                startPolling();
              } else {
                logger.debug('Tab hidden, pausing badge polling');
                stopPolling();
              }
            })
          );

          // Auth state watcher
          effect(() => {
            const authReady = authFlow.isAuthReady();
            const authenticated = authFlow.isAuthenticated();
            const user = authFlow.user();
            isAuthed = authReady && authenticated;
            // Only fetch once Firebase has fully settled its auth state (isAuthReady).
            // Using isInitialized() was too early — it fires on localStorage restore
            // before Firebase confirms the session, causing a 401 race condition.
            if (authReady && authenticated && user) {
              void fetchBadgesIfNeeded();

              // Start polling (only when tab is visible)
              if (document.visibilityState === 'visible') {
                startPolling();
              }
            } else {
              // Signed out or no user data yet — clear badges and stop polling
              badges.clearAll();
              stopPolling();
            }
          });
        }
      },
    },
  ]);
}
