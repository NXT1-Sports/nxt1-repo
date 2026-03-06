/**
 * @fileoverview Settings API Service - Angular HTTP Adapter
 * @module @nxt1/web/features/settings
 * @version 1.0.0
 *
 * Angular HTTP adapter for the Settings API.
 * Wraps future pure TypeScript API factory with Angular's HttpClient
 * and Firebase Performance tracing.
 *
 * NOTE: The settings backend API (preferences persistence, usage data)
 * is not yet implemented. This service is the correct place to add
 * those calls when the backend endpoints are ready.
 *
 * Pattern:
 * - Performance traces go here (not in SettingsService which is in @nxt1/ui)
 * - HTTP calls go here using Angular HttpClient
 * - SettingsService (packages/ui) consumes the result via signals
 */

import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import type { SettingsUsage } from '@nxt1/core';
import { environment } from '../../../../environments/environment';
import { PerformanceService } from '../../../core/services/performance.service';
import { TRACE_NAMES, ATTRIBUTE_NAMES } from '@nxt1/core/performance';

/**
 * Settings API Service.
 *
 * Performance traces for all settings operations.
 * When backend endpoints are ready, HTTP calls are added here.
 */
@Injectable({ providedIn: 'root' })
export class SettingsApiService {
  private readonly http = inject(HttpClient);
  private readonly performance = inject(PerformanceService);
  private readonly baseUrl = environment.apiURL;

  /**
   * Load user settings and preferences from the backend.
   * Wraps the operation in a performance trace.
   *
   * @returns User preferences when backend API is available
   * @future Connect to POST /settings/load or GET /settings/preferences
   */
  async loadSettings(): Promise<void> {
    return this.performance.trace(
      TRACE_NAMES.SETTINGS_LOAD,
      async () => {
        // TODO: Fetch real preferences from backend when available
        // const response = await firstValueFrom(
        //   this.http.get<ApiResponse<SettingsPreferences>>(`${this.baseUrl}/settings/preferences`)
        // );
        // if (!response.success) throw new Error(response.error ?? 'Failed to load settings');
        // return response.data;
      },
      {
        attributes: {
          [ATTRIBUTE_NAMES.FEATURE_NAME]: 'settings',
        },
      }
    );
  }

  /**
   * Persist a preference update to the backend.
   *
   * @param key  Preference key (e.g. 'pushNotifications')
   * @param value New value
   * @future Connect to PATCH /settings/preferences
   */
  async updatePreference(key: string, value: boolean | string): Promise<void> {
    return this.performance.trace(
      TRACE_NAMES.SETTINGS_PREFERENCE_UPDATE,
      async () => {
        // TODO: Persist to backend when available
        // const response = await firstValueFrom(
        //   this.http.patch<ApiResponse<void>>(`${this.baseUrl}/settings/preferences`, { [key]: value })
        // );
        // if (!response.success) throw new Error(response.error ?? 'Failed to update preference');
      },
      {
        attributes: {
          [ATTRIBUTE_NAMES.FEATURE_NAME]: 'settings',
          preference_key: key,
          preference_type: typeof value,
        },
      }
    );
  }

  /**
   * Fetch current usage stats (storage, AI requests, etc.).
   *
   * @future Connect to GET /settings/usage
   */
  async getUsage(): Promise<SettingsUsage | null> {
    return this.performance.trace(
      TRACE_NAMES.SETTINGS_LOAD,
      async (): Promise<SettingsUsage | null> => {
        // TODO: Fetch usage from backend when available
        // const response = await firstValueFrom(
        //   this.http.get<ApiResponse<SettingsUsage>>(`${this.baseUrl}/settings/usage`)
        // );
        // return response.success ? (response.data ?? null) : null;
        return null;
      },
      {
        attributes: {
          [ATTRIBUTE_NAMES.FEATURE_NAME]: 'settings',
          operation: 'get_usage',
        },
      }
    );
  }
}
