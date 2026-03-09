/**
 * @fileoverview Settings Types - Pure TypeScript Interfaces
 * @module @nxt1/core/settings
 * @version 1.0.0
 *
 * Type definitions for the Settings feature.
 * 100% portable - no framework dependencies.
 *
 * ⭐ SHARED BETWEEN WEB, MOBILE, AND BACKEND ⭐
 */

// ============================================
// SECTION TYPES
// ============================================

/**
 * Settings section identifiers.
 * Maps to the main sections in the settings UI.
 */
export type SettingsSectionId =
  | 'account'
  | 'preferences'
  | 'billing'
  | 'tools'
  | 'support'
  | 'legal';

/**
 * Settings item type - determines how the item is rendered.
 */
export type SettingsItemType =
  | 'toggle' // Switch/toggle for boolean settings
  | 'navigation' // Navigates to a sub-page or external link
  | 'action' // Triggers an action (button-like)
  | 'info' // Display-only information
  | 'select' // Dropdown/picker selection
  | 'button'; // Primary/secondary action button

/**
 * Settings item variant - visual styling.
 */
export type SettingsItemVariant = 'default' | 'primary' | 'danger' | 'warning' | 'muted';

/**
 * Icon names used in settings UI.
 */
export type SettingsIconName =
  // Account
  | 'person-outline'
  | 'mail-outline'
  | 'shield-outline'
  | 'key-outline'
  | 'finger-print-outline'
  | 'logout'
  | 'log-out-outline'
  | 'trash'
  | 'trash-outline'
  // Preferences
  | 'moon-outline'
  | 'sunny-outline'
  | 'notifications-outline'
  | 'globe-outline'
  | 'color-palette-outline'
  | 'eye-outline'
  | 'eye-off-outline'
  | 'gift-outline'
  // Billing
  | 'card-outline'
  | 'receipt-outline'
  | 'trending-up-outline'
  | 'star-outline'
  | 'diamond-outline'
  // Tools
  | 'link-outline'
  | 'analytics-outline'
  | 'cloud-outline'
  | 'sync-outline'
  | 'extension-puzzle-outline'
  // Support
  | 'help-circle-outline'
  | 'chatbubble-outline'
  | 'document-text-outline'
  | 'refresh-outline'
  | 'bug-outline'
  // Legal
  | 'lock-closed-outline'
  | 'document-outline'
  | 'information-circle-outline'
  // Navigation
  | 'chevron-forward'
  | 'open-outline';

// ============================================
// SETTINGS ITEM INTERFACES
// ============================================

/**
 * Base settings item structure.
 */
export interface SettingsItemBase {
  /** Unique identifier for the item */
  readonly id: string;
  /** Section this item belongs to */
  readonly section: SettingsSectionId;
  /** Display label */
  readonly label: string;
  /** Optional description/subtitle */
  readonly description?: string;
  /** Icon to display */
  readonly icon?: SettingsIconName;
  /** Item type determines rendering */
  readonly type: SettingsItemType;
  /** Visual variant */
  readonly variant?: SettingsItemVariant;
  /** Whether item is disabled */
  readonly disabled?: boolean;
  /** Badge to show (e.g., "NEW", "PRO") */
  readonly badge?: string;
  /** Badge color variant */
  readonly badgeVariant?: 'primary' | 'secondary' | 'success' | 'warning' | 'error';
}

/**
 * Toggle setting item.
 */
export interface SettingsToggleItem extends SettingsItemBase {
  readonly type: 'toggle';
  /** Current toggle value */
  readonly value: boolean;
  /** Key for persisting this setting */
  readonly settingKey: string;
}

/**
 * Navigation setting item (leads to sub-page or external link).
 */
export interface SettingsNavigationItem extends SettingsItemBase {
  readonly type: 'navigation';
  /** Route to navigate to (internal) */
  readonly route?: string;
  /** External URL to open */
  readonly externalUrl?: string;
  /** Optional value to display on the right */
  readonly displayValue?: string;
}

/**
 * Action setting item (triggers an action).
 */
export interface SettingsActionItem extends SettingsItemBase {
  readonly type: 'action';
  /** Action identifier for handling */
  readonly action: string;
  /** Confirmation required before action */
  readonly requiresConfirmation?: boolean;
  /** Confirmation message */
  readonly confirmationMessage?: string;
}

/**
 * Info setting item (display only).
 */
export interface SettingsInfoItem extends SettingsItemBase {
  readonly type: 'info';
  /** Value to display */
  readonly value: string;
  /** Whether value can be copied */
  readonly copyable?: boolean;
}

/**
 * Select setting item (dropdown/picker).
 */
export interface SettingsSelectItem extends SettingsItemBase {
  readonly type: 'select';
  /** Currently selected value */
  readonly value: string;
  /** Available options */
  readonly options: readonly SettingsSelectOption[];
  /** Key for persisting this setting */
  readonly settingKey: string;
}

/**
 * Button setting item (primary/secondary action).
 */
export interface SettingsButtonItem extends SettingsItemBase {
  readonly type: 'button';
  /** Button style */
  readonly buttonVariant: 'primary' | 'secondary' | 'danger' | 'outline';
  /** Action identifier */
  readonly action: string;
  /** Whether button should be full width */
  readonly fullWidth?: boolean;
}

/**
 * Select option for dropdown/picker items.
 */
export interface SettingsSelectOption {
  readonly id: string;
  readonly label: string;
  readonly icon?: SettingsIconName;
  readonly disabled?: boolean;
}

/**
 * Union type of all settings items.
 */
export type SettingsItem =
  | SettingsToggleItem
  | SettingsNavigationItem
  | SettingsActionItem
  | SettingsInfoItem
  | SettingsSelectItem
  | SettingsButtonItem;

// ============================================
// SECTION INTERFACES
// ============================================

/**
 * Settings section configuration.
 */
export interface SettingsSection {
  /** Section identifier */
  readonly id: SettingsSectionId;
  /** Section title */
  readonly title: string;
  /** Optional section description */
  readonly description?: string;
  /** Section icon */
  readonly icon?: SettingsIconName;
  /** Items in this section */
  readonly items: readonly SettingsItem[];
  /** Whether section is collapsible */
  readonly collapsible?: boolean;
  /** Whether section starts collapsed */
  readonly collapsed?: boolean;
}

// ============================================
// USER & ACCOUNT TYPES
// ============================================

/**
 * User account info displayed in settings.
 */
export interface SettingsUserInfo {
  readonly id: string;
  readonly email: string;
  readonly displayName: string | null;
  readonly profileImg: string | null;
  readonly role: string;
  readonly emailVerified: boolean;
  readonly createdAt: string;
  readonly lastLoginAt: string | null;
}

/**
 * Subscription info for billing section.
 */
export interface SettingsSubscription {
  readonly tier: 'free' | 'pro' | 'premium' | 'team';
  readonly status: 'active' | 'trialing' | 'past_due' | 'canceled' | 'expired';
  readonly currentPeriodEnd: string | null;
  readonly cancelAtPeriodEnd: boolean;
  readonly trialEnd: string | null;
}

/**
 * Usage stats for billing section.
 */
export interface SettingsUsage {
  readonly profileViews: number;
  readonly profileViewsLimit: number;
  readonly videosUploaded: number;
  readonly videosLimit: number;
  readonly storageUsedMb: number;
  readonly storageLimitMb: number;
  readonly aiRequestsUsed: number;
  readonly aiRequestsLimit: number;
}

/**
 * Connected provider info for tools section.
 */
export interface SettingsConnectedProvider {
  readonly id: string;
  readonly name: string;
  readonly icon: SettingsIconName;
  readonly connected: boolean;
  readonly connectedAt: string | null;
  readonly email?: string;
  readonly username?: string;
}

// ============================================
// PREFERENCES TYPES
// ============================================

/**
 * User preferences that can be toggled.
 */
export interface SettingsPreferences {
  // Notifications
  readonly emailNotifications: boolean;
  readonly pushNotifications: boolean;
  readonly marketingEmails: boolean;
  readonly weeklyDigest: boolean;

  // Privacy
  readonly profileVisibility: 'public' | 'private' | 'connections';
  readonly showActivityStatus: boolean;
  readonly allowTagging: boolean;

  // Activity Tracking
  readonly activityTracking: boolean;
  readonly analyticsTracking: boolean;
  readonly crashReporting: boolean;

  // Security
  readonly biometricLogin: boolean;

  // Display
  readonly theme: 'light' | 'dark' | 'system';
  readonly language: string;
  readonly compactMode: boolean;
}

// ============================================
// STATE & API TYPES
// ============================================

/**
 * Settings page state.
 */
export interface SettingsState {
  readonly user: SettingsUserInfo | null;
  readonly subscription: SettingsSubscription | null;
  readonly usage: SettingsUsage | null;
  readonly preferences: SettingsPreferences | null;
  readonly connectedProviders: readonly SettingsConnectedProvider[];
  readonly sections: readonly SettingsSection[];
  readonly isLoading: boolean;
  readonly isSaving: boolean;
  readonly error: string | null;
}

/**
 * Settings update request.
 */
export interface SettingsUpdateRequest {
  readonly key: string;
  readonly value: unknown;
}

/**
 * Settings API response.
 */
export interface SettingsResponse {
  readonly user: SettingsUserInfo;
  readonly subscription: SettingsSubscription;
  readonly usage: SettingsUsage;
  readonly preferences: SettingsPreferences;
  readonly connectedProviders: readonly SettingsConnectedProvider[];
}

/**
 * Settings event types for tracking.
 */
export type SettingsEventType =
  | 'settings_viewed'
  | 'settings_section_expanded'
  | 'settings_toggle_changed'
  | 'settings_action_triggered'
  | 'settings_navigation'
  | 'settings_provider_connected'
  | 'settings_provider_disconnected';

/**
 * Settings event payload.
 */
export interface SettingsEvent {
  readonly type: SettingsEventType;
  readonly sectionId?: SettingsSectionId;
  readonly itemId?: string;
  readonly value?: unknown;
  readonly timestamp: number;
}
