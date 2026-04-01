/**
 * @fileoverview Settings Module - Barrel Export
 * @module @nxt1/core/settings
 * @version 1.0.0
 *
 * Exports all Settings feature types, constants, and API.
 *
 * ⭐ SHARED BETWEEN WEB, MOBILE, AND BACKEND ⭐
 */

// Types
export type {
  // Section types
  SettingsSectionId,
  SettingsItemType,
  SettingsItemVariant,
  SettingsIconName,
  // Item interfaces
  SettingsItemBase,
  SettingsToggleItem,
  SettingsNavigationItem,
  SettingsActionItem,
  SettingsInfoItem,
  SettingsButtonItem,
  SettingsItem,
  // Section interfaces
  SettingsSection,
  // User & account
  SettingsUserInfo,
  SettingsSubscription,
  SettingsUsage,
  SettingsConnectedProvider,
  // Preferences
  SettingsPreferences,
  // State & API
  SettingsState,
  SettingsUpdateRequest,
  SettingsResponse,
  SettingsEventType,
  SettingsEvent,
} from './settings.types';

// Constants
export {
  // Section metadata
  SETTINGS_SECTIONS_META,
  SETTINGS_SECTION_ORDER,
  // Section items
  SETTINGS_ACCOUNT_ITEMS,
  SETTINGS_PREFERENCES_ITEMS,
  SETTINGS_BILLING_ITEMS,
  SETTINGS_TOOLS_ITEMS,
  SETTINGS_SUPPORT_ITEMS,
  SETTINGS_LEGAL_ITEMS,
  // Defaults
  DEFAULT_SETTINGS_SECTIONS,
  DEFAULT_SETTINGS_PREFERENCES,
  DEFAULT_CONNECTED_PROVIDERS,
  // Role-aware factory
  getSettingsSectionsForRole,
  // UI config
  SETTINGS_UI_CONFIG,
  // Cache
  SETTINGS_CACHE_KEYS,
  SETTINGS_CACHE_TTL,
  // API
  SETTINGS_API_ENDPOINTS,
} from './settings.constants';

// API
export { createSettingsApi, type SettingsApi } from './settings.api';
