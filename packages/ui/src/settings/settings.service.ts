/**
 * @fileoverview Settings Service - Shared State Management
 * @module @nxt1/ui/settings
 * @version 1.0.0
 *
 * Signal-based state management for Settings feature.
 * Shared between web and mobile applications.
 *
 * Features:
 * - Reactive state with Angular signals
 * - Section management
 * - Preference updates
 * - Subscription/usage data
 * - Connected providers management
 *
 * @example
 * ```typescript
 * @Component({...})
 * export class SettingsPageComponent {
 *   private readonly settings = inject(SettingsService);
 *
 *   readonly user = this.settings.user;
 *   readonly sections = this.settings.sections;
 *   readonly isLoading = this.settings.isLoading;
 * }
 * ```
 */

import { Injectable, inject, signal, computed } from '@angular/core';
import {
  type SettingsUserInfo,
  type SettingsSubscription,
  type SettingsUsage,
  type SettingsPreferences,
  type SettingsConnectedProvider,
  type SettingsSection,
  type SettingsToggleItem,
  type SettingsSelectItem,
  DEFAULT_SETTINGS_SECTIONS,
  DEFAULT_SETTINGS_PREFERENCES,
  DEFAULT_CONNECTED_PROVIDERS,
} from '@nxt1/core';
import { HapticsService } from '../services/haptics/haptics.service';
import { NxtToastService } from '../services/toast/toast.service';
import { NxtLoggingService } from '../services/logging/logging.service';

/**
 * Mock data for development.
 * TODO: Replace with actual API calls when backend is ready.
 */
const MOCK_USER: SettingsUserInfo = {
  id: 'user_123',
  email: 'john.doe@example.com',
  displayName: 'John Doe',
  photoURL: null,
  role: 'athlete',
  emailVerified: true,
  createdAt: '2024-01-15T10:00:00Z',
  lastLoginAt: '2026-02-02T08:30:00Z',
};

const MOCK_SUBSCRIPTION: SettingsSubscription = {
  tier: 'free',
  status: 'active',
  currentPeriodEnd: null,
  cancelAtPeriodEnd: false,
  trialEnd: null,
};

const MOCK_USAGE: SettingsUsage = {
  profileViews: 156,
  profileViewsLimit: 500,
  videosUploaded: 3,
  videosLimit: 5,
  storageUsedMb: 245,
  storageLimitMb: 500,
  aiRequestsUsed: 12,
  aiRequestsLimit: 25,
};

/**
 * Settings state management service.
 * Provides reactive state for the settings interface.
 */
@Injectable({ providedIn: 'root' })
export class SettingsService {
  private readonly haptics = inject(HapticsService);
  private readonly toast = inject(NxtToastService);
  private readonly logger = inject(NxtLoggingService).child('SettingsService');

  // ============================================
  // PRIVATE WRITEABLE SIGNALS
  // ============================================

  private readonly _user = signal<SettingsUserInfo | null>(null);
  private readonly _subscription = signal<SettingsSubscription | null>(null);
  private readonly _usage = signal<SettingsUsage | null>(null);
  private readonly _preferences = signal<SettingsPreferences>(DEFAULT_SETTINGS_PREFERENCES);
  private readonly _connectedProviders = signal<readonly SettingsConnectedProvider[]>(
    DEFAULT_CONNECTED_PROVIDERS
  );
  private readonly _sections = signal<readonly SettingsSection[]>(DEFAULT_SETTINGS_SECTIONS);
  private readonly _isLoading = signal(false);
  private readonly _isSaving = signal(false);
  private readonly _error = signal<string | null>(null);

  // ============================================
  // PUBLIC READONLY COMPUTED SIGNALS
  // ============================================

  /** Current user info */
  readonly user = computed(() => this._user());

  /** Current subscription */
  readonly subscription = computed(() => this._subscription());

  /** Current usage stats */
  readonly usage = computed(() => this._usage());

  /** Current preferences */
  readonly preferences = computed(() => this._preferences());

  /** Connected providers */
  readonly connectedProviders = computed(() => this._connectedProviders());

  /** Settings sections with current values */
  readonly sections = computed(() => this._sections());

  /** Whether loading data */
  readonly isLoading = computed(() => this._isLoading());

  /** Whether saving data */
  readonly isSaving = computed(() => this._isSaving());

  /** Current error message */
  readonly error = computed(() => this._error());

  /** Whether user is on free plan */
  readonly isFreePlan = computed(() => this._subscription()?.tier === 'free');

  /** Usage percentage for storage */
  readonly storageUsagePercent = computed(() => {
    const usage = this._usage();
    if (!usage) return 0;
    return Math.round((usage.storageUsedMb / usage.storageLimitMb) * 100);
  });

  /** Usage percentage for AI requests */
  readonly aiUsagePercent = computed(() => {
    const usage = this._usage();
    if (!usage) return 0;
    return Math.round((usage.aiRequestsUsed / usage.aiRequestsLimit) * 100);
  });

  // ============================================
  // PUBLIC METHODS
  // ============================================

  /**
   * Load all settings data.
   * Call this when entering the settings page.
   */
  async loadSettings(): Promise<void> {
    if (this._isLoading()) return;

    this._isLoading.set(true);
    this._error.set(null);

    this.logger.debug('Loading settings data');

    try {
      // Simulate API call
      await new Promise((resolve) => setTimeout(resolve, 300));

      // Set mock data
      this._user.set(MOCK_USER);
      this._subscription.set(MOCK_SUBSCRIPTION);
      this._usage.set(MOCK_USAGE);
      this._preferences.set(DEFAULT_SETTINGS_PREFERENCES);
      this._connectedProviders.set(DEFAULT_CONNECTED_PROVIDERS);

      // Update sections with current preference values
      this.updateSectionsWithPreferences();

      this.logger.info('Settings loaded successfully');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load settings';
      this._error.set(message);
      this.logger.error('Failed to load settings', err);
    } finally {
      this._isLoading.set(false);
    }
  }

  /**
   * Refresh settings data.
   */
  async refresh(): Promise<void> {
    await this.loadSettings();
    await this.haptics.impact('light');
    this.toast.success('Settings refreshed');
  }

  /**
   * Update a preference toggle.
   */
  async updatePreference(key: string, value: boolean): Promise<void> {
    this._isSaving.set(true);

    try {
      this.logger.debug('Updating preference', { key, value });

      // Optimistic update
      this._preferences.update((prefs) => ({
        ...prefs,
        [key]: value,
      }));

      // Update section items
      this.updateSectionsWithPreferences();

      // Simulate API call
      await new Promise((resolve) => setTimeout(resolve, 200));

      await this.haptics.notification('success');
      this.logger.info('Preference updated', { key, value });
    } catch (err) {
      // Rollback on error
      this._preferences.update((prefs) => ({
        ...prefs,
        [key]: !value,
      }));
      this.updateSectionsWithPreferences();

      const message = err instanceof Error ? err.message : 'Failed to update preference';
      this.toast.error(message);
      this.logger.error('Failed to update preference', err, { key, value });
    } finally {
      this._isSaving.set(false);
    }
  }

  /**
   * Update a select preference.
   */
  async updateSelectPreference(key: string, value: string): Promise<void> {
    this._isSaving.set(true);

    try {
      this.logger.debug('Updating select preference', { key, value });

      // Optimistic update
      this._preferences.update((prefs) => ({
        ...prefs,
        [key]: value,
      }));

      // Update section items
      this.updateSectionsWithPreferences();

      // Simulate API call
      await new Promise((resolve) => setTimeout(resolve, 200));

      await this.haptics.notification('success');
      this.logger.info('Select preference updated', { key, value });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update preference';
      this.toast.error(message);
      this.logger.error('Failed to update select preference', err, { key, value });
    } finally {
      this._isSaving.set(false);
    }
  }

  /**
   * Connect a provider.
   */
  async connectProvider(providerId: string): Promise<void> {
    this.logger.debug('Connecting provider', { providerId });

    try {
      // TODO: Implement OAuth flow
      await this.haptics.impact('medium');
      this.toast.info('Provider connection coming soon');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to connect provider';
      this.toast.error(message);
      this.logger.error('Failed to connect provider', err, { providerId });
    }
  }

  /**
   * Disconnect a provider.
   */
  async disconnectProvider(providerId: string): Promise<void> {
    this.logger.debug('Disconnecting provider', { providerId });

    try {
      this._connectedProviders.update((providers) =>
        providers.map((p) =>
          p.id === providerId ? { ...p, connected: false, connectedAt: null } : p
        )
      );

      await this.haptics.notification('success');
      this.toast.success('Provider disconnected');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to disconnect provider';
      this.toast.error(message);
      this.logger.error('Failed to disconnect provider', err, { providerId });
    }
  }

  /**
   * Sign out user.
   */
  async signOut(): Promise<void> {
    this.logger.info('Sign out requested');
    // TODO: Implement actual sign out
    await this.haptics.impact('medium');
  }

  /**
   * Delete account.
   */
  async deleteAccount(): Promise<void> {
    this.logger.info('Delete account requested');
    // TODO: Implement actual account deletion
    await this.haptics.notification('warning');
  }

  /**
   * Check for app updates.
   */
  async checkForUpdates(): Promise<void> {
    this.logger.debug('Checking for updates');

    try {
      await this.haptics.impact('light');

      // Simulate check
      await new Promise((resolve) => setTimeout(resolve, 1000));

      this.toast.success('App is up to date');
    } catch (err) {
      this.toast.error('Failed to check for updates');
      this.logger.error('Failed to check for updates', err);
    }
  }

  /**
   * Report a bug.
   */
  async reportBug(): Promise<void> {
    this.logger.debug('Report bug requested');
    await this.haptics.impact('light');
    // TODO: Open bug report form/modal
    this.toast.info('Bug reporting coming soon');
  }

  // ============================================
  // PRIVATE METHODS
  // ============================================

  /**
   * Update section items with current preference values.
   */
  private updateSectionsWithPreferences(): void {
    const prefs = this._preferences();
    const subscription = this._subscription();

    this._sections.update((sections) =>
      sections.map((section) => ({
        ...section,
        items: section.items.map((item) => {
          if (item.type === 'toggle') {
            const toggleItem = item as SettingsToggleItem;
            const value = (prefs as unknown as Record<string, unknown>)[toggleItem.settingKey];
            if (typeof value === 'boolean') {
              return { ...toggleItem, value };
            }
          }

          if (item.type === 'select') {
            const selectItem = item as SettingsSelectItem;
            const value = (prefs as unknown as Record<string, unknown>)[selectItem.settingKey];
            if (typeof value === 'string') {
              return { ...selectItem, value };
            }
          }

          // Update current plan display value
          if (item.id === 'currentPlan' && item.type === 'navigation') {
            const tierLabels: Record<string, string> = {
              free: 'Free',
              pro: 'Pro',
              premium: 'Premium',
              team: 'Team',
            };
            return {
              ...item,
              displayValue: tierLabels[subscription?.tier ?? 'free'] ?? 'Free',
            };
          }

          return item;
        }),
      }))
    );
  }
}
