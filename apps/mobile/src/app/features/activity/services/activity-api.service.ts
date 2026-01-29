/**
 * @fileoverview Activity API Service - Mobile HTTP Adapter
 * @module @nxt1/mobile/features/activity
 * @version 1.0.0
 *
 * Capacitor HTTP adapter for Activity API.
 * Uses native HTTP for better performance and SSL pinning.
 */

import { Injectable, inject, InjectionToken } from '@angular/core';
import { CapacitorHttp } from '@capacitor/core';
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

/**
 * Injection token for API base URL.
 */
export const ACTIVITY_API_BASE_URL = new InjectionToken<string>('ACTIVITY_API_BASE_URL', {
  providedIn: 'root',
  factory: () => environment.apiUrl,
});

/**
 * Activity API Service.
 * Mobile adapter using Capacitor HTTP for native networking.
 */
@Injectable({ providedIn: 'root' })
export class ActivityApiService implements ActivityApi {
  private readonly baseUrl = inject(ACTIVITY_API_BASE_URL);

  private readonly api = createActivityApi(
    {
      get: async <T>(url: string) => {
        const response = await CapacitorHttp.get({ url });
        return response.data as T;
      },
      post: async <T>(url: string, data: unknown) => {
        const response = await CapacitorHttp.post({
          url,
          data: data as object,
          headers: { 'Content-Type': 'application/json' },
        });
        return response.data as T;
      },
      put: async <T>(url: string, data: unknown) => {
        const response = await CapacitorHttp.put({
          url,
          data: data as object,
          headers: { 'Content-Type': 'application/json' },
        });
        return response.data as T;
      },
      patch: async <T>(url: string, data: unknown) => {
        const response = await CapacitorHttp.patch({
          url,
          data: data as object,
          headers: { 'Content-Type': 'application/json' },
        });
        return response.data as T;
      },
      delete: async <T>(url: string) => {
        const response = await CapacitorHttp.delete({ url });
        return response.data as T;
      },
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
