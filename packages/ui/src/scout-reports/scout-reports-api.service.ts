/**
 * @fileoverview Scout Reports Angular HTTP Adapter Service
 * @module @nxt1/ui/scout-reports
 * @version 1.0.0
 *
 * Angular HTTP client adapter for scout reports API.
 * Wraps the pure @nxt1/core API factory with Angular's HttpClient.
 *
 * ⭐ WEB APP ONLY - Mobile uses Capacitor HTTP ⭐
 *
 * Features:
 * - Wraps core API factory
 * - Integrates with Angular HttpClient
 * - Automatic auth token handling
 * - Error transformation
 *
 * @example
 * ```typescript
 * const api = inject(ScoutReportsApiService);
 * const response = await api.getReports({ category: 'trending' });
 * ```
 */

import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { createScoutReportsApi } from '@nxt1/core';

/**
 * Environment injection token - should be provided by app.
 */
const API_BASE_URL = '/api/v1'; // Default, should be configured via environment

/**
 * Angular wrapper for Scout Reports API.
 * Delegates to the pure TypeScript API factory.
 */
@Injectable({ providedIn: 'root' })
export class ScoutReportsApiService {
  private readonly http = inject(HttpClient);

  /**
   * HTTP adapter for pure API functions.
   */
  private readonly httpAdapter = {
    get: <T>(url: string) => firstValueFrom(this.http.get<T>(url)),
    post: <T>(url: string, body: unknown) => firstValueFrom(this.http.post<T>(url, body)),
    put: <T>(url: string, body: unknown) => firstValueFrom(this.http.put<T>(url, body)),
    patch: <T>(url: string, body: unknown) => firstValueFrom(this.http.patch<T>(url, body)),
    delete: <T>(url: string) => firstValueFrom(this.http.delete<T>(url)),
  };

  /**
   * Pure API instance - all methods delegated to this.
   */
  private readonly api = createScoutReportsApi(this.httpAdapter, API_BASE_URL);

  // Expose API methods directly
  readonly getReports = this.api.getReports;
  readonly getReportsByCategory = this.api.getReportsByCategory;
  readonly getReport = this.api.getReport;
  readonly searchReports = this.api.searchReports;
  readonly trackView = this.api.trackView;
  readonly getSummary = this.api.getSummary;
}
