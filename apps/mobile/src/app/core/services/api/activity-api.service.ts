/**
 * @fileoverview Activity API Service - Mobile HTTP Adapter
 * @module @nxt1/mobile/features/activity
 * @version 1.0.0
 *
 * Capacitor HTTP adapter for Activity API.
 * Uses CapacitorHttpAdapter for native HTTP with automatic auth headers.
 */

import { Injectable, inject } from '@angular/core';
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
import { CapacitorHttpAdapter } from '../../infrastructure';
import { environment } from '../../../../environments/environment';

/**
 * Activity API Service.
 * Mobile adapter using CapacitorHttpAdapter for native networking with auth.
 */
@Injectable({ providedIn: 'root' })
export class ActivityApiService implements ActivityApi {
  private readonly http = inject(CapacitorHttpAdapter);

  private readonly api = createActivityApi(this.http, environment.apiUrl);

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
