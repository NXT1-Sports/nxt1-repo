/**
 * @fileoverview Badge Bridge Initializer
 * @module @nxt1/web/core/services
 * @version 1.0.0
 *
 * Connects the @nxt1/ui ActivityService badge counts to the local
 * BadgeCountService. This bridge exists because:
 *
 * 1. WebShellComponent reads from BadgeCountService (lightweight, no barrel import)
 * 2. ActivityService (@nxt1/ui) is the source of truth for notification counts
 * 3. This initializer creates a reactive effect that bridges the two
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
  type EnvironmentProviders,
} from '@angular/core';
import { ActivityService } from '@nxt1/ui/activity';
import { BadgeCountService } from './badge-count.service';

/**
 * Provides a bridge that syncs `ActivityService.totalUnread` → `BadgeCountService.activityBadge`.
 *
 * Runs as an `ENVIRONMENT_INITIALIZER` so the badge count is available
 * before any component renders. The `effect()` is reactive — any time
 * `ActivityService.totalUnread()` changes, `BadgeCountService` is updated.
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

        // Reactive bridge: whenever ActivityService counts change, update BadgeCountService
        effect(() => {
          badges.setActivityBadge(activityService.totalUnread());
        });
      },
    },
  ]);
}
