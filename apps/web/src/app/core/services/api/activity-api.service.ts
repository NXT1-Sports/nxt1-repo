/**
 * @fileoverview Activity API Service - Angular HTTP Adapter
 * @module @nxt1/web/features/activity
 * @version 1.0.0
 *
 * Angular HTTP adapter for Activity API.
 * Wraps the pure TypeScript API factory with Angular's HttpClient.
 */

import { Injectable, inject, InjectionToken } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import {
  createActivityApi,
  type ActivityApi,
  type ActivityFilter,
  type ActivityFeedResponse,
  type ActivityMarkReadResponse,
  type ActivityTabId,
  type ActivityItem,
  type ActivitySummary,
} from '@nxt1/core';
import { environment } from '../../../../environments/environment';
import { PerformanceService } from '..';
import { TRACE_NAMES, ATTRIBUTE_NAMES, METRIC_NAMES } from '@nxt1/core/performance';

/**
 * Injection token for API base URL.
 * Apps can provide custom URL:
 *
 * ```typescript
 * { provide: ACTIVITY_API_BASE_URL, useValue: environment.apiURL }
 * ```
 */
export const ACTIVITY_API_BASE_URL = new InjectionToken<string>('ACTIVITY_API_BASE_URL', {
  providedIn: 'root',
  factory: () => environment.apiURL,
});

/**
 * Activity API Service.
 * Angular adapter for the pure TypeScript Activity API.
 */
@Injectable({ providedIn: 'root' })
export class ActivityApiService implements ActivityApi {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(ACTIVITY_API_BASE_URL);
  private readonly performance = inject(PerformanceService);

  private readonly api = createActivityApi(
    {
      get: <T>(url: string) => firstValueFrom(this.http.get<T>(url)),
      post: <T>(url: string, body: unknown) => firstValueFrom(this.http.post<T>(url, body)),
      put: <T>(url: string, body: unknown) => firstValueFrom(this.http.put<T>(url, body)),
      patch: <T>(url: string, body: unknown) => firstValueFrom(this.http.patch<T>(url, body)),
      delete: <T>(url: string) => firstValueFrom(this.http.delete<T>(url)),
    },
    this.baseUrl
  );

  // ============================================
  // DELEGATE TO PURE API WITH PERFORMANCE TRACING
  // ============================================

  getFeed(filter?: ActivityFilter): Promise<ActivityFeedResponse> {
    return this.performance.trace(TRACE_NAMES.FEED_LOAD, () => this.api.getFeed(filter), {
      attributes: {
        [ATTRIBUTE_NAMES.FEATURE_NAME]: 'activity_feed',
        feed_tab: filter?.tab || 'all',
        has_filter: filter ? 'true' : 'false',
      },
      onSuccess: async (feed, trace) => {
        await trace.putMetric(METRIC_NAMES.ITEMS_LOADED, feed.items?.length || 0);
      },
    });
  }

  getItem(id: string): Promise<ActivityItem | null> {
    return this.performance.trace(TRACE_NAMES.ACTIVITY_ITEM_LOAD, () => this.api.getItem(id), {
      attributes: {
        [ATTRIBUTE_NAMES.FEATURE_NAME]: 'activity_feed',
        item_id: id,
      },
    });
  }

  markRead(ids: string[]): Promise<ActivityMarkReadResponse> {
    return this.performance.trace(TRACE_NAMES.ACTIVITY_MARK_READ, () => this.api.markRead(ids), {
      attributes: {
        [ATTRIBUTE_NAMES.FEATURE_NAME]: 'activity_feed',
      },
      metrics: {
        items_marked: ids.length,
      },
    });
  }

  markAllRead(tab: ActivityTabId): Promise<ActivityMarkReadResponse> {
    return this.performance.trace(
      TRACE_NAMES.ACTIVITY_MARK_ALL_READ,
      () => this.api.markAllRead(tab),
      {
        attributes: {
          [ATTRIBUTE_NAMES.FEATURE_NAME]: 'activity_feed',
          tab: tab,
        },
      }
    );
  }

  getBadges(): Promise<Record<ActivityTabId, number>> {
    return this.performance.trace(TRACE_NAMES.ACTIVITY_BADGES_LOAD, () => this.api.getBadges(), {
      attributes: {
        [ATTRIBUTE_NAMES.FEATURE_NAME]: 'activity_feed',
      },
    });
  }

  getSummary(): Promise<ActivitySummary> {
    return this.performance.trace(TRACE_NAMES.ACTIVITY_SUMMARY_LOAD, () => this.api.getSummary(), {
      attributes: {
        [ATTRIBUTE_NAMES.FEATURE_NAME]: 'activity_feed',
      },
    });
  }

  archive(ids: string[]): Promise<{ success: boolean; count: number }> {
    return this.performance.trace(TRACE_NAMES.ACTIVITY_ARCHIVE, () => this.api.archive(ids), {
      attributes: {
        [ATTRIBUTE_NAMES.FEATURE_NAME]: 'activity_feed',
      },
      metrics: {
        items_archived: ids.length,
      },
    });
  }

  restore(ids: string[]): Promise<{ success: boolean; count: number }> {
    return this.performance.trace(TRACE_NAMES.ACTIVITY_RESTORE, () => this.api.restore(ids), {
      attributes: {
        [ATTRIBUTE_NAMES.FEATURE_NAME]: 'activity_feed',
      },
      metrics: {
        items_restored: ids.length,
      },
    });
  }
}
