/**
 * @fileoverview Settings Constants - Configuration & UI Config
 * @module @nxt1/core/settings
 * @version 1.0.0
 *
 * Constants for the Settings feature including section definitions,
 * icons, colors, and UI configuration.
 *
 * 100% portable - no framework dependencies.
 *
 * ⭐ SHARED BETWEEN WEB, MOBILE, AND BACKEND ⭐
 */

import type {
  SettingsSectionId,
  SettingsSection,
  SettingsItem,
  SettingsPreferences,
  SettingsConnectedProvider,
} from './settings.types';
import { isTeamRole } from '../constants/user.constants';

// ============================================
// SECTION METADATA
// ============================================

/**
 * Section metadata for rendering headers.
 */
export const SETTINGS_SECTIONS_META: Record<
  SettingsSectionId,
  { title: string; description: string; icon: string }
> = {
  account: {
    title: 'Account Information',
    description: 'Manage your account information and security',
    icon: 'person-outline',
  },
  preferences: {
    title: 'Preferences',
    description: 'Customize your experience',
    icon: 'color-palette-outline',
  },
  billing: {
    title: 'Billing & Usage',
    description: 'Manage your subscription and view usage',
    icon: 'card-outline',
  },
  tools: {
    title: 'Tools & Integrations',
    description: 'Connected services and tracking',
    icon: 'extension-puzzle-outline',
  },
  support: {
    title: 'Support',
    description: 'Get help and check for updates',
    icon: 'help-circle-outline',
  },
  legal: {
    title: 'Legal',
    description: 'Privacy, terms, and legal information',
    icon: 'document-text-outline',
  },
};

/**
 * Section order for rendering.
 */
export const SETTINGS_SECTION_ORDER: readonly SettingsSectionId[] = [
  'account',
  'preferences',
  'billing',
  'tools',
  'support',
  'legal',
] as const;

// ============================================
// ACCOUNT SECTION ITEMS
// ============================================

export const SETTINGS_ACCOUNT_ITEMS: readonly SettingsItem[] = [
  {
    id: 'accountInformation',
    section: 'account',
    type: 'navigation',
    label: 'Account Information',
    description: 'Manage your email address and password',
    icon: 'shield-outline',
    route: '/settings/account-information',
  },
  {
    id: 'biometrics',
    section: 'account',
    type: 'toggle',
    label: 'Biometric Login',
    description: 'Use Face ID or Touch ID to sign in',
    icon: 'finger-print-outline',
    value: false,
    settingKey: 'biometricLogin',
  },
] as const;

// ============================================
// PREFERENCES SECTION ITEMS
// ============================================

export const SETTINGS_PREFERENCES_ITEMS: readonly SettingsItem[] = [
  {
    id: 'pushNotifications',
    section: 'preferences',
    type: 'toggle',
    label: 'Push Notifications',
    description: 'Receive push notifications on your device',
    icon: 'notifications-outline',
    value: true,
    settingKey: 'pushNotifications',
  },
  {
    id: 'emailNotifications',
    section: 'preferences',
    type: 'toggle',
    label: 'Email Notifications',
    description: 'Receive updates via email',
    icon: 'mail-outline',
    value: true,
    settingKey: 'emailNotifications',
  },
  {
    id: 'marketingEmails',
    section: 'preferences',
    type: 'toggle',
    label: 'Marketing & Promotions',
    description: 'Receive news and promotional content',
    icon: 'gift-outline',
    value: true,
    settingKey: 'marketingEmails',
  },
] as const;

// ============================================
// BILLING SECTION ITEMS
// ============================================

export const SETTINGS_BILLING_ITEMS: readonly SettingsItem[] = [
  {
    id: 'paymentMethods',
    section: 'billing',
    type: 'navigation',
    label: 'Payment Methods',
    description: 'Manage cards and payment options',
    icon: 'card-outline',
    route: '/usage?section=payment-info',
  },
  {
    id: 'billingHistory',
    section: 'billing',
    type: 'navigation',
    label: 'Billing History',
    description: 'View past invoices and receipts',
    icon: 'receipt-outline',
    route: '/usage?section=payment-history',
  },
  {
    id: 'usage',
    section: 'billing',
    type: 'navigation',
    label: 'Usage & Limits',
    description: 'View your current usage statistics',
    icon: 'trending-up-outline',
    route: '/usage?section=metered-usage',
  },
] as const;

// ============================================
// TOOLS SECTION ITEMS
// ============================================

export const SETTINGS_TOOLS_ITEMS: readonly SettingsItem[] = [
  {
    id: 'connectProvider',
    section: 'tools',
    type: 'action',
    label: 'Connected Accounts',
    description: 'Link social and streaming accounts',
    icon: 'link-outline',
    action: 'connectedAccounts',
  },
  {
    id: 'activityTracking',
    section: 'tools',
    type: 'toggle',
    label: 'Activity Tracking',
    description: 'Track your in-app activity for insights',
    icon: 'analytics-outline',
    value: true,
    settingKey: 'activityTracking',
  },
  {
    id: 'analyticsTracking',
    section: 'tools',
    type: 'toggle',
    label: 'Analytics',
    description: 'Help improve NXT1 with anonymous usage data',
    icon: 'trending-up-outline',
    value: true,
    settingKey: 'analyticsTracking',
  },
] as const;

// ============================================
// SUPPORT SECTION ITEMS
// ============================================

export const SETTINGS_SUPPORT_ITEMS: readonly SettingsItem[] = [
  {
    id: 'helpCenter',
    section: 'support',
    type: 'navigation',
    label: 'Help Center',
    description: 'Browse FAQs and guides',
    icon: 'help-circle-outline',
    route: '/help-center',
  },
  {
    id: 'contactUs',
    section: 'support',
    type: 'action',
    label: 'Contact Us',
    description: 'Get in touch with our support team',
    icon: 'chatbubble-outline',
    action: 'contactSupport',
  },
  {
    id: 'reportBug',
    section: 'support',
    type: 'action',
    label: 'Report a Bug',
    description: 'Let us know about any issues',
    icon: 'bug-outline',
    action: 'reportBug',
  },
] as const;

// ============================================
// LEGAL SECTION ITEMS
// ============================================

export const SETTINGS_LEGAL_ITEMS: readonly SettingsItem[] = [
  {
    id: 'privacyPolicy',
    section: 'legal',
    type: 'navigation',
    label: 'Privacy Policy',
    icon: 'lock-closed-outline',
    route: '/privacy',
  },
  {
    id: 'termsOfService',
    section: 'legal',
    type: 'navigation',
    label: 'Terms of Service',
    icon: 'document-outline',
    route: '/terms',
  },
] as const;

// ============================================
// DEFAULT SECTION CONFIGURATIONS
// ============================================

/**
 * All default settings sections with their items.
 */
export const DEFAULT_SETTINGS_SECTIONS: readonly SettingsSection[] = [
  {
    id: 'account',
    title: 'Account Information',
    description: SETTINGS_SECTIONS_META.account.description,
    icon: 'person-outline',
    items: SETTINGS_ACCOUNT_ITEMS,
  },
  {
    id: 'preferences',
    title: SETTINGS_SECTIONS_META.preferences.title,
    description: SETTINGS_SECTIONS_META.preferences.description,
    icon: 'color-palette-outline',
    items: SETTINGS_PREFERENCES_ITEMS,
  },
  {
    id: 'billing',
    title: SETTINGS_SECTIONS_META.billing.title,
    description: SETTINGS_SECTIONS_META.billing.description,
    icon: 'card-outline',
    items: SETTINGS_BILLING_ITEMS,
  },
  {
    id: 'tools',
    title: SETTINGS_SECTIONS_META.tools.title,
    description: SETTINGS_SECTIONS_META.tools.description,
    icon: 'extension-puzzle-outline',
    items: SETTINGS_TOOLS_ITEMS,
  },
  {
    id: 'support',
    title: SETTINGS_SECTIONS_META.support.title,
    description: SETTINGS_SECTIONS_META.support.description,
    icon: 'help-circle-outline',
    items: SETTINGS_SUPPORT_ITEMS,
  },
  {
    id: 'legal',
    title: SETTINGS_SECTIONS_META.legal.title,
    description: SETTINGS_SECTIONS_META.legal.description,
    icon: 'document-text-outline',
    items: SETTINGS_LEGAL_ITEMS,
  },
] as const;

// ============================================
// ROLE-AWARE SECTION FACTORY
// ============================================

/** OAuth providers that don't use password-based credentials. */
const OAUTH_PROVIDERS = new Set(['google', 'apple', 'microsoft']);

/** Options for filtering settings sections. */
export interface SettingsSectionOptions {
  /** Auth provider used to sign in (e.g. 'email', 'google', 'apple'). */
  readonly authProvider?: string | null;
  /** True when running inside a native Capacitor app (iOS/Android). */
  readonly isNativeMobile?: boolean;
}

/**
 * Returns the settings sections appropriate for the given user role and options.
 *
 * - Athletes, parents, and recruiters do NOT see the billing section —
 *   billing/subscription management is only relevant for team accounts.
 * - Coaches and directors DO see billing and usage.
 * - Biometric login toggle is hidden when:
 *   a) Running on web (not native mobile) — hardware not available.
 *   b) User signed in via OAuth (Google / Apple) — no password to store.
 *
 * Uses `isTeamRole()` from user.constants as the single source of truth.
 */
export function getSettingsSectionsForRole(
  role: string | null | undefined,
  options: SettingsSectionOptions = {}
): readonly SettingsSection[] {
  const { authProvider, isNativeMobile } = options;
  let sections: readonly SettingsSection[] = DEFAULT_SETTINGS_SECTIONS;

  // Non-team roles: hide billing section
  if (!isTeamRole(role)) {
    sections = sections.filter((section) => section.id !== 'billing');
  }

  // Hide biometric login toggle on web or for OAuth users
  const hideBiometrics =
    isNativeMobile === false || (authProvider != null && OAUTH_PROVIDERS.has(authProvider));

  if (hideBiometrics) {
    sections = sections.map((section) =>
      section.id === 'account'
        ? { ...section, items: section.items.filter((item) => item.id !== 'biometrics') }
        : section
    );
  }

  return sections;
}

// ============================================
// DEFAULT PREFERENCES
// ============================================

/**
 * Default user preferences.
 */
export const DEFAULT_SETTINGS_PREFERENCES: SettingsPreferences = {
  emailNotifications: true,
  pushNotifications: true,
  marketingEmails: true,
  activityTracking: true,
  analyticsTracking: true,
  biometricLogin: false,
} as const;

// ============================================
// CONNECTED PROVIDERS
// ============================================

/**
 * Default connected providers list.
 */
export const DEFAULT_CONNECTED_PROVIDERS: readonly SettingsConnectedProvider[] = [
  {
    id: 'google',
    name: 'Google',
    icon: 'link-outline',
    connected: false,
    connectedAt: null,
  },
  {
    id: 'apple',
    name: 'Apple',
    icon: 'link-outline',
    connected: false,
    connectedAt: null,
  },
  {
    id: 'twitter',
    name: 'X (Twitter)',
    icon: 'link-outline',
    connected: false,
    connectedAt: null,
  },
  {
    id: 'instagram',
    name: 'Instagram',
    icon: 'link-outline',
    connected: false,
    connectedAt: null,
  },
  {
    id: 'hudl',
    name: 'Hudl',
    icon: 'link-outline',
    connected: false,
    connectedAt: null,
  },
] as const;

// ============================================
// UI CONFIGURATION
// ============================================

/**
 * UI configuration for settings components.
 */
export const SETTINGS_UI_CONFIG = {
  /** Animation duration in ms */
  animationDuration: 200,
  /** Haptic feedback type for toggles */
  toggleHaptic: 'selection' as const,
  /** Haptic feedback type for actions */
  actionHaptic: 'light' as const,
  /** Haptic feedback type for destructive actions */
  destructiveHaptic: 'warning' as const,
  /** Number of skeleton items to show while loading */
  skeletonCount: 6,
  /** Section header height */
  sectionHeaderHeight: 48,
  /** Item row height */
  itemRowHeight: 64,
  /** Item row height with description */
  itemRowHeightWithDescription: 80,
} as const;

// ============================================
// CACHE CONFIGURATION
// ============================================

/**
 * Cache keys for settings data.
 */
export const SETTINGS_CACHE_KEYS = {
  USER_SETTINGS: 'settings:user',
  PREFERENCES: 'settings:preferences',
  SUBSCRIPTION: 'settings:subscription',
  USAGE: 'settings:usage',
  CONNECTED_PROVIDERS: 'settings:providers',
} as const;

/**
 * Cache TTLs for settings data.
 */
export const SETTINGS_CACHE_TTL = {
  /** User settings - 5 minutes */
  USER_SETTINGS: 300_000,
  /** Preferences - 15 minutes */
  PREFERENCES: 900_000,
  /** Subscription - 1 hour */
  SUBSCRIPTION: 3_600_000,
  /** Usage - 5 minutes (frequently updated) */
  USAGE: 300_000,
  /** Connected providers - 15 minutes */
  CONNECTED_PROVIDERS: 900_000,
} as const;

// ============================================
// API ENDPOINTS
// ============================================

/**
 * API endpoints for settings operations.
 */
export const SETTINGS_API_ENDPOINTS = {
  GET_SETTINGS: '/api/v1/settings',
  UPDATE_PREFERENCES: '/api/v1/settings/preferences',
  UPDATE_PROFILE: '/api/v1/settings/profile',
  CHANGE_PASSWORD: '/api/v1/settings/password',
  DELETE_ACCOUNT: '/api/v1/settings/account',
  GET_SUBSCRIPTION: '/api/v1/settings/subscription',
  GET_USAGE: '/api/v1/settings/usage',
  GET_BILLING_HISTORY: '/api/v1/settings/billing/history',
  CONNECT_PROVIDER: '/api/v1/settings/providers/connect',
  DISCONNECT_PROVIDER: '/api/v1/settings/providers/disconnect',
  CHECK_UPDATE: '/api/v1/settings/check-update',
} as const;
