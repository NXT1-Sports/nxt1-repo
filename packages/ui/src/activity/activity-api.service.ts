/**
 * @fileoverview Activity API Service - Angular HTTP Adapter
 * @module @nxt1/ui/activity
 * @version 1.0.0
 *
 * Angular HTTP adapter for Activity API.
 * Wraps the pure TypeScript API factory with Angular's HttpClient.
 */

import { Injectable, InjectionToken, inject } from '@angular/core';
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

/**
 * Injection token for API base URL.
 * Apps should provide this in their config:
 *
 * ```typescript
 * { provide: ACTIVITY_API_BASE_URL, useValue: environment.apiUrl }
 * ```
 */
export const ACTIVITY_API_BASE_URL = new InjectionToken<string>('ACTIVITY_API_BASE_URL', {
  providedIn: 'root',
  factory: () => '/api/v1',
});

/**
 * Activity API Service.
 * Angular adapter for the pure TypeScript Activity API.
 */
@Injectable({ providedIn: 'root' })
export class ActivityApiService implements ActivityApi {
  private readonly http = inject(HttpClient);

  private readonly baseUrl = inject(ACTIVITY_API_BASE_URL);

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
  // DELEGATE TO PURE API
  // ============================================

  getFeed(filter?: ActivityFilter): Promise<ActivityFeedResponse> {
    return this.api.getFeed(filter);
  }

  getItem(id: string): Promise<ActivityItem | null> {
    return this.api.getItem(id);
  }

  markRead(ids: string[]): Promise<ActivityMarkReadResponse> {
    return this.api.markRead(ids);
  }

  markAllRead(tab: ActivityTabId): Promise<ActivityMarkReadResponse> {
    return this.api.markAllRead(tab);
  }

  getBadges(): Promise<Record<ActivityTabId, number>> {
    return this.api.getBadges();
  }

  getSummary(): Promise<ActivitySummary> {
    return this.api.getSummary();
  }

  archive(ids: string[]): Promise<{ success: boolean; count: number }> {
    return this.api.archive(ids);
  }

  restore(ids: string[]): Promise<{ success: boolean; count: number }> {
    return this.api.restore(ids);
  }
}
