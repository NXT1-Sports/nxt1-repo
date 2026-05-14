/**
 * @fileoverview Feature Flags API Factory
 * @module @nxt1/core/flags
 *
 * ⭐ THIS FILE IS 100% PORTABLE - NO PLATFORM DEPENDENCIES ⭐
 *
 * Pure TypeScript API factory for feature flags.
 * Works on backend (Node.js), frontend (browser), and mobile (Capacitor).
 *
 * Usage:
 * ```typescript
 * // Backend (Node.js)
 * const api = createFlagsApi(httpAdapter, 'http://localhost:3000');
 * const enabled = await api.isEnabled('team.intel.enabled');
 *
 * // Frontend (Angular HTTP)
 * const api = createFlagsApi(httpAdapter, environment.apiUrl);
 * const flags = await api.getFlagValues(['team.intel.enabled', 'agent.primary.enabled']);
 *
 * // Mobile (Capacitor)
 * const api = createFlagsApi(capacitorHttpAdapter, API_URL);
 * const isEnabled = await api.isEnabled('athlete.highlights.ai.enabled');
 * ```
 *
 * @author NXT1 Engineering
 * @version 1.0.0
 */

import type { HttpAdapter } from '../api';
import type { FeatureFlagKey, FlagValue, FlagsApi } from './flags.types';

/**
 * Create a feature flags API adapter — 100% portable factory.
 *
 * @param http HTTP adapter (browser HttpClient, Node.js, or Capacitor)
 * @param baseUrl Base API URL (e.g., http://localhost:3000 or https://api.nxt1.com)
 * @returns Feature flags API implementation
 *
 * @example Backend usage
 * ```typescript
 * const api = createFlagsApi(httpAdapter, 'http://localhost:3000');
 * const enabled = await api.isEnabled('team.intel.enabled');
 * ```
 */
export function createFlagsApi(http: HttpAdapter, baseUrl: string): FlagsApi {
  const endpoint = `${baseUrl}/api/v1/flags`;

  return {
    async getFlagValue(key: FeatureFlagKey): Promise<FlagValue> {
      const response = await http.get<{
        success: boolean;
        data?: FlagValue;
        error?: string;
      }>(`${endpoint}/${encodeURIComponent(key)}`);

      if (!response.success) {
        throw new Error(response.error ?? `Failed to fetch flag: ${key}`);
      }

      return response.data ?? null;
    },

    async getFlagValues(
      keys: readonly FeatureFlagKey[]
    ): Promise<Readonly<Record<FeatureFlagKey, FlagValue>>> {
      const queryString = keys.map((k) => `keys=${encodeURIComponent(k)}`).join('&');
      const response = await http.get<{
        success: boolean;
        data?: Record<FeatureFlagKey, FlagValue>;
        error?: string;
      }>(`${endpoint}/batch?${queryString}`);

      if (!response.success) {
        throw new Error(response.error ?? 'Failed to fetch flags');
      }

      return (response.data ?? {}) as Readonly<Record<FeatureFlagKey, FlagValue>>;
    },

    async getAllFlags(): Promise<Readonly<Record<FeatureFlagKey, FlagValue>>> {
      const response = await http.get<{
        success: boolean;
        data?: Record<FeatureFlagKey, FlagValue>;
        error?: string;
      }>(`${endpoint}/all`);

      if (!response.success) {
        throw new Error(response.error ?? 'Failed to fetch all flags');
      }

      return (response.data ?? {}) as Readonly<Record<FeatureFlagKey, FlagValue>>;
    },

    async isEnabled(key: FeatureFlagKey): Promise<boolean> {
      const value = await this.getFlagValue(key);
      return value === true;
    },
  } as const;
}

export type FlagsApiType = ReturnType<typeof createFlagsApi>;
