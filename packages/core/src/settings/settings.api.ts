/**
 * @fileoverview Settings API Factory - Pure TypeScript
 * @module @nxt1/core/settings
 * @version 1.0.0
 *
 * API factory function for settings operations.
 * Uses HttpAdapter pattern for platform portability.
 *
 * 100% portable - no framework dependencies.
 *
 * ⭐ SHARED BETWEEN WEB, MOBILE, AND BACKEND ⭐
 */

import type { HttpAdapter } from '../api/http-adapter';
import type {
  SettingsResponse,
  SettingsPreferences,
  SettingsSubscription,
  SettingsUsage,
  SettingsConnectedProvider,
} from './settings.types';
import { SETTINGS_API_ENDPOINTS } from './settings.constants';

/**
 * Generic API response wrapper.
 * Simplified version for settings API.
 */
interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Settings API interface.
 */
export interface SettingsApi {
  /** Fetch all settings data */
  getSettings(): Promise<SettingsResponse>;

  /** Update a single preference */
  updatePreference(key: string, value: unknown): Promise<SettingsPreferences>;

  /** Update multiple preferences */
  updatePreferences(updates: Record<string, unknown>): Promise<SettingsPreferences>;

  /** Get subscription info */
  getSubscription(): Promise<SettingsSubscription>;

  /** Get usage statistics */
  getUsage(): Promise<SettingsUsage>;

  /** Get connected providers */
  getConnectedProviders(): Promise<readonly SettingsConnectedProvider[]>;

  /** Connect a provider */
  connectProvider(providerId: string, authCode?: string): Promise<SettingsConnectedProvider>;

  /** Disconnect a provider */
  disconnectProvider(providerId: string): Promise<void>;

  /** Change password */
  changePassword(currentPassword: string, newPassword: string): Promise<void>;

  /** Delete account */
  deleteAccount(password: string): Promise<void>;

  /** Check for app updates */
  checkForUpdate(): Promise<{ hasUpdate: boolean; version?: string; url?: string }>;
}

/**
 * Create settings API with HttpAdapter.
 *
 * @param http - Platform-specific HTTP adapter
 * @param baseUrl - API base URL
 * @returns Settings API instance
 *
 * @example
 * ```typescript
 * // Angular (web)
 * const api = createSettingsApi(angularHttpAdapter, environment.apiUrl);
 *
 * // Capacitor (mobile)
 * const api = createSettingsApi(capacitorHttpAdapter, API_URL);
 * ```
 */
export function createSettingsApi(http: HttpAdapter, baseUrl: string): SettingsApi {
  const buildUrl = (endpoint: string): string => `${baseUrl}${endpoint}`;

  return {
    async getSettings(): Promise<SettingsResponse> {
      const response = await http.get<ApiResponse<SettingsResponse>>(
        buildUrl(SETTINGS_API_ENDPOINTS.GET_SETTINGS)
      );

      if (!response.success || !response.data) {
        throw new Error(response.error ?? 'Failed to fetch settings');
      }

      return response.data;
    },

    async updatePreference(key: string, value: unknown): Promise<SettingsPreferences> {
      const response = await http.patch<ApiResponse<SettingsPreferences>>(
        buildUrl(SETTINGS_API_ENDPOINTS.UPDATE_PREFERENCES),
        { [key]: value }
      );

      if (!response.success || !response.data) {
        throw new Error(response.error ?? 'Failed to update preference');
      }

      return response.data;
    },

    async updatePreferences(updates: Record<string, unknown>): Promise<SettingsPreferences> {
      const response = await http.patch<ApiResponse<SettingsPreferences>>(
        buildUrl(SETTINGS_API_ENDPOINTS.UPDATE_PREFERENCES),
        updates
      );

      if (!response.success || !response.data) {
        throw new Error(response.error ?? 'Failed to update preferences');
      }

      return response.data;
    },

    async getSubscription(): Promise<SettingsSubscription> {
      const response = await http.get<ApiResponse<SettingsSubscription>>(
        buildUrl(SETTINGS_API_ENDPOINTS.GET_SUBSCRIPTION)
      );

      if (!response.success || !response.data) {
        throw new Error(response.error ?? 'Failed to fetch subscription');
      }

      return response.data;
    },

    async getUsage(): Promise<SettingsUsage> {
      const response = await http.get<ApiResponse<SettingsUsage>>(
        buildUrl(SETTINGS_API_ENDPOINTS.GET_USAGE)
      );

      if (!response.success || !response.data) {
        throw new Error(response.error ?? 'Failed to fetch usage');
      }

      return response.data;
    },

    async getConnectedProviders(): Promise<readonly SettingsConnectedProvider[]> {
      const response = await http.get<ApiResponse<SettingsConnectedProvider[]>>(
        buildUrl(SETTINGS_API_ENDPOINTS.CONNECT_PROVIDER)
      );

      if (!response.success) {
        throw new Error(response.error ?? 'Failed to fetch connected providers');
      }

      return response.data ?? [];
    },

    async connectProvider(
      providerId: string,
      authCode?: string
    ): Promise<SettingsConnectedProvider> {
      const response = await http.post<ApiResponse<SettingsConnectedProvider>>(
        buildUrl(SETTINGS_API_ENDPOINTS.CONNECT_PROVIDER),
        { providerId, authCode }
      );

      if (!response.success || !response.data) {
        throw new Error(response.error ?? 'Failed to connect provider');
      }

      return response.data;
    },

    async disconnectProvider(providerId: string): Promise<void> {
      const response = await http.post<ApiResponse<void>>(
        buildUrl(SETTINGS_API_ENDPOINTS.DISCONNECT_PROVIDER),
        { providerId }
      );

      if (!response.success) {
        throw new Error(response.error ?? 'Failed to disconnect provider');
      }
    },

    async changePassword(currentPassword: string, newPassword: string): Promise<void> {
      const response = await http.post<ApiResponse<void>>(
        buildUrl(SETTINGS_API_ENDPOINTS.CHANGE_PASSWORD),
        { currentPassword, newPassword }
      );

      if (!response.success) {
        throw new Error(response.error ?? 'Failed to change password');
      }
    },

    async deleteAccount(password: string): Promise<void> {
      const response = await http.post<ApiResponse<void>>(
        buildUrl(SETTINGS_API_ENDPOINTS.DELETE_ACCOUNT),
        { password }
      );

      if (!response.success) {
        throw new Error(response.error ?? 'Failed to delete account');
      }
    },

    async checkForUpdate(): Promise<{ hasUpdate: boolean; version?: string; url?: string }> {
      const response = await http.get<
        ApiResponse<{ hasUpdate: boolean; version?: string; url?: string }>
      >(buildUrl(SETTINGS_API_ENDPOINTS.CHECK_UPDATE));

      if (!response.success || !response.data) {
        throw new Error(response.error ?? 'Failed to check for updates');
      }

      return response.data;
    },
  } as const;
}
