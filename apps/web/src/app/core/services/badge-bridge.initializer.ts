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
  makeEnvironmentProviders,
  ENVIRONMENT_INITIALIZER,
  PLATFORM_ID,
  type EnvironmentProviders,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { ActivityService } from '@nxt1/ui/activity';
import { NxtLoggingService } from '@nxt1/ui/services/logging';
import { BadgeCountService } from './badge-count.service';
import { AuthFlowService } from '../../features/auth/services';

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
        const logger = inject(NxtLoggingService).child('BadgeBridge');

        // Reactive bridge: whenever ActivityService counts change, update BadgeCountService
        effect(() => {
          badges.setActivityBadge(activityService.totalUnread());
        });

        // Auth-aware badge lifecycle (browser only — skip during SSR)
        if (isPlatformBrowser(platformId)) {
          let pollTimer: ReturnType<typeof setInterval> | null = null;
          let isAuthed = false;

          const startPolling = (): void => {
            stopPolling();
            pollTimer = setInterval(() => {
              activityService.refreshBadges().catch(() => {
                // Silent fail — will retry next interval
              });
            }, BADGE_POLL_INTERVAL_MS);
          };

          const stopPolling = (): void => {
            if (pollTimer) {
              clearInterval(pollTimer);
              pollTimer = null;
            }
          };

          // Visibility API: pause polling when tab is hidden,
          // refresh immediately + resume polling when tab is visible.
          // (Discord / Slack / Twitter pattern)
          document.addEventListener('visibilitychange', () => {
            if (!isAuthed) return;

            if (document.visibilityState === 'visible') {
              // Tab became visible — fetch immediately, then resume polling
              activityService.refreshBadges().catch(() => {
                // Silent fail
              });
              startPolling();
            } else {
              // Tab hidden — pause polling to save resources
              stopPolling();
            }
          });

          // Auth state watcher
          effect(() => {
            const authenticated = authFlow.isAuthenticated();
            isAuthed = authenticated;

            if (authenticated) {
              // Fetch badges immediately on auth
              activityService.refreshBadges().catch(() => {
                logger.warn('Initial badge fetch failed — will retry on next poll');
              });

              // Start polling (only when tab is visible)
              if (document.visibilityState === 'visible') {
                startPolling();
              }
            } else {
              // Signed out — clear badges and stop polling
              badges.clearAll();
              stopPolling();
            }
          });
        }
      },
    },
  ]);
}
