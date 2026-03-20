/**
 * @fileoverview Analytics Dashboard API Service - Angular HTTP Adapter
 * @module @nxt1/ui/analytics-dashboard
 * @version 1.0.0
 *
 * Angular HTTP adapter for Analytics Dashboard API.
 * Wraps the pure TypeScript API factory with Angular's HttpClient.
 */

import { Injectable, InjectionToken, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import {
  createAnalyticsDashboardApi,
  type AnalyticsDashboardApi,
  type AnalyticsRequest,
  type AnalyticsReport,
  type AnalyticsPeriod,
} from '@nxt1/core';

// ============================================
// INJECTION TOKENS
// ============================================

/**
 * Injection token for analytics API base URL.
 */
export const ANALYTICS_API_BASE_URL = new InjectionToken<string>('ANALYTICS_API_BASE_URL', {
  providedIn: 'root',
  factory: () => '/api/v1',
});

/**
 * Platform adapter token for the Analytics Dashboard API.
 */
export const ANALYTICS_DASHBOARD_API_ADAPTER = new InjectionToken<AnalyticsDashboardApi>(
  'ANALYTICS_DASHBOARD_API_ADAPTER',
  {
    providedIn: 'root',
    factory: () => inject(AnalyticsDashboardApiService),
  }
);

// ============================================
// SERVICE
// ============================================

/**
 * Analytics Dashboard API Service.
 * Angular adapter for the pure TypeScript Analytics Dashboard API.
 */
@Injectable({ providedIn: 'root' })
export class AnalyticsDashboardApiService implements AnalyticsDashboardApi {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(ANALYTICS_API_BASE_URL);

  private readonly api: AnalyticsDashboardApi = createAnalyticsDashboardApi(
    {
      get: <T>(url: string, config?: { params?: Record<string, string | number | boolean> }) => {
        let httpParams = new HttpParams();
        if (config?.params) {
          for (const [key, value] of Object.entries(config.params)) {
            if (value !== undefined && value !== null) {
              httpParams = httpParams.set(key, String(value));
            }
          }
        }
        return firstValueFrom(this.http.get<T>(url, { params: httpParams }));
      },
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

  getReport(request: AnalyticsRequest): Promise<AnalyticsReport> {
    return this.api.getReport(request);
  }

  getOverview(
    userId: string,
    role: 'athlete' | 'coach',
    period: AnalyticsPeriod
  ): ReturnType<AnalyticsDashboardApi['getOverview']> {
    return this.api.getOverview(userId, role, period);
  }

  getEngagement(
    userId: string,
    period: AnalyticsPeriod
  ): ReturnType<AnalyticsDashboardApi['getEngagement']> {
    return this.api.getEngagement(userId, period);
  }

  getContent(
    userId: string,
    period: AnalyticsPeriod
  ): ReturnType<AnalyticsDashboardApi['getContent']> {
    return this.api.getContent(userId, period);
  }

  getRecruiting(
    userId: string,
    period: AnalyticsPeriod
  ): ReturnType<AnalyticsDashboardApi['getRecruiting']> {
    return this.api.getRecruiting(userId, period);
  }

  getRoster(
    teamCodeId: string,
    period: AnalyticsPeriod,
    sortBy?: 'engagement' | 'views' | 'name' | 'classOf',
    limit?: number
  ): ReturnType<AnalyticsDashboardApi['getRoster']> {
    return this.api.getRoster(teamCodeId, period, sortBy, limit);
  }

  getInsights(
    userId: string,
    role: 'athlete' | 'coach',
    period: AnalyticsPeriod
  ): ReturnType<AnalyticsDashboardApi['getInsights']> {
    return this.api.getInsights(userId, role, period);
  }

  exportReport(
    userId: string,
    role: 'athlete' | 'coach',
    period: AnalyticsPeriod,
    format: 'pdf' | 'csv'
  ): ReturnType<AnalyticsDashboardApi['exportReport']> {
    return this.api.exportReport(userId, role, period, format);
  }
}
