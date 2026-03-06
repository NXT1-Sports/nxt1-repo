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

import { Injectable, inject, signal, computed, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
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
import { APP_EVENTS } from '@nxt1/core/analytics';
import type { AnalyticsAdapter } from '@nxt1/core/analytics';
import { HapticsService } from '../services/haptics/haptics.service';
import { NxtToastService } from '../services/toast/toast.service';
import { NxtLoggingService } from '../services/logging/logging.service';
import { NxtBrowserService } from '../services/browser/browser.service';
import { NxtBreadcrumbService } from '../services/breadcrumb';
import { ANALYTICS_ADAPTER } from '../services/analytics/analytics-adapter.token';
import { NxtBottomSheetService, SHEET_PRESETS } from '../components/bottom-sheet';

/**
 * Default subscription for users without active billing data.
 */
const DEFAULT_SUBSCRIPTION: SettingsSubscription = {
  tier: 'free',
  status: 'active',
  currentPeriodEnd: null,
  cancelAtPeriodEnd: false,
  trialEnd: null,
};

/**
 * Settings state management service.
 * Provides reactive state for the settings interface.
 *
 * Platform wrappers (web/mobile) provide user and subscription
 * data via `setUser()` and `setSubscription()` before the shell
 * calls `loadSettings()`.
 */
@Injectable({ providedIn: 'root' })
export class SettingsService {
  private readonly haptics = inject(HapticsService);
  private readonly toast = inject(NxtToastService);
  private readonly logger = inject(NxtLoggingService).child('SettingsService');
  private readonly browser = inject(NxtBrowserService);
  private readonly breadcrumb = inject(NxtBreadcrumbService);
  private readonly analytics: AnalyticsAdapter | null =
    inject(ANALYTICS_ADAPTER, { optional: true }) ?? null;
  private readonly platformId = inject(PLATFORM_ID);
  private readonly bottomSheet = inject(NxtBottomSheetService);

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
   * Set user info from platform-specific auth service.
   * Call this from the web/mobile wrapper before the shell initializes.
   */
  setUser(user: SettingsUserInfo | null): void {
    this._user.set(user);
    this.logger.debug('User info set', { userId: user?.id ?? null });
  }

  /**
   * Set subscription info from platform-specific billing service.
   * Falls back to DEFAULT_SUBSCRIPTION if not called.
   */
  setSubscription(subscription: SettingsSubscription): void {
    this._subscription.set(subscription);
    this.logger.debug('Subscription set', { tier: subscription.tier });
  }

  /**
   * Load all settings data.
   * Call this when entering the settings page.
   * Expects `setUser()` to have been called first by the platform wrapper.
   */
  async loadSettings(): Promise<void> {
    if (this._isLoading()) return;

    this._isLoading.set(true);
    this._error.set(null);

    this.logger.debug('Loading settings data');

    try {
      // Use default subscription if none was set by the wrapper
      if (!this._subscription()) {
        this._subscription.set(DEFAULT_SUBSCRIPTION);
      }

      // Usage data will come from a backend API when available
      // For now, leave as null (UI handles null gracefully)

      this._preferences.set(DEFAULT_SETTINGS_PREFERENCES);
      this._connectedProviders.set(DEFAULT_CONNECTED_PROVIDERS);

      // Update sections with current preference values
      this.updateSectionsWithPreferences();

      this.logger.info('Settings loaded successfully');
      this.breadcrumb.trackStateChange('settings:loaded');
      this.analytics?.trackEvent(APP_EVENTS.SETTINGS_VIEWED);
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
    const previous = this._preferences();

    try {
      this.logger.debug('Updating preference', { key, value });

      // Optimistic update
      this._preferences.update((prefs) => ({
        ...prefs,
        [key]: value,
      }));

      // Update section items
      this.updateSectionsWithPreferences();

      // TODO: Persist to backend when preferences API is available
      // await this.api.updatePreference(key, value);

      await this.haptics.notification('success');
      this.logger.info('Preference updated', { key, value });
    } catch (err) {
      // Rollback on error
      this._preferences.set(previous);
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
    const previous = this._preferences();

    try {
      this.logger.debug('Updating select preference', { key, value });

      // Optimistic update
      this._preferences.update((prefs) => ({
        ...prefs,
        [key]: value,
      }));

      // Update section items
      this.updateSectionsWithPreferences();

      // TODO: Persist to backend when preferences API is available
      // await this.api.updateSelectPreference(key, value);

      await this.haptics.notification('success');
      this.logger.info('Select preference updated', { key, value });
    } catch (err) {
      // Rollback with previous state
      this._preferences.set(previous);
      this.updateSectionsWithPreferences();

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
   * The actual sign-out is handled by the platform wrapper
   * via the shell's (signOut) event. This method handles the
   * service-side cleanup.
   */
  async signOut(): Promise<void> {
    this.logger.info('Sign out requested');
    this.breadcrumb.trackUserAction('settings:sign-out');
    await this.haptics.impact('medium');
    // Clear settings state
    this._user.set(null);
    this._subscription.set(null);
    this._usage.set(null);
  }

  /**
   * Delete account.
   * The actual deletion is handled by the platform wrapper
   * via the shell's (deleteAccount) event. This method handles
   * service-side cleanup.
   */
  async deleteAccount(): Promise<void> {
    this.logger.info('Delete account requested');
    this.breadcrumb.trackUserAction('settings:delete-account');
    await this.haptics.notification('warning');
  }

  /**
   * Check for app updates.
   */
  async checkForUpdates(): Promise<void> {
    this.logger.debug('Checking for updates');
    this.breadcrumb.trackStateChange('settings:checking-updates');
    this.analytics?.trackEvent(APP_EVENTS.SETTINGS_CHECK_UPDATES);

    try {
      await this.haptics.impact('light');

      const result = await this.bottomSheet.show({
        showClose: false,
        actions: [
          {
            label: 'App is up to date',
            role: 'secondary',
            icon: 'checkmark-circle-outline',
            disabled: true,
          },
          {
            label: 'Update',
            role: 'primary',
            icon: 'download-outline',
          },
          {
            label: 'Later',
            role: 'cancel',
          },
        ],
        ...SHEET_PRESETS.COMPACT,
      });

      if (!result.confirmed) return;

      if (isPlatformBrowser(this.platformId)) {
        window.location.reload();
        return;
      }

      this.toast.info('Please update from your app store if an update is available.');
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
    this.breadcrumb.trackUserAction('report-bug');
    this.analytics?.trackEvent(APP_EVENTS.SETTINGS_REPORT_BUG);
    await this.haptics.impact('light');

    const result = await this.browser.openMailto({
      to: 'support@nxt1sports.com',
      subject: 'Bug Report - NXT1 Sports',
      body: [
        'Describe the issue you encountered:',
        '',
        'Steps to reproduce:',
        '1. ',
        '2. ',
        '3. ',
        '',
        'Expected result:',
        '',
        'Actual result:',
        '',
        'Device/Platform:',
      ].join('\n'),
    });

    if (!result.success) {
      this.logger.error('Failed to open email for bug report', { error: result.error });
      this.toast.error('Unable to open email. Please email support@nxt1sports.com directly.');
    }
  }

  /**
   * Contact support via email.
   */
  async contactSupport(): Promise<void> {
    this.logger.debug('Contact support requested');
    this.breadcrumb.trackUserAction('contact-support');
    this.analytics?.trackEvent(APP_EVENTS.SETTINGS_CONTACT_SUPPORT);
    await this.haptics.impact('light');

    const result = await this.browser.openMailto({
      to: 'support@nxt1sports.com',
      subject: 'Support Request - NXT1 Sports',
      body: ['Hi NXT1 Support Team,', '', 'I need help with:', '', 'My account email:'].join('\n'),
    });

    if (!result.success) {
      this.logger.error('Failed to open email for support', { error: result.error });
      this.toast.error('Unable to open email. Please email support@nxt1sports.com directly.');
    }
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
