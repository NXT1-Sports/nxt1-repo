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
  type SettingsItem,
  type SettingsSectionId,
  type SettingsToggleItem,
  DEFAULT_SETTINGS_SECTIONS,
  DEFAULT_SETTINGS_PREFERENCES,
  DEFAULT_CONNECTED_PROVIDERS,
  getSettingsSectionsForRole,
} from '@nxt1/core';
import { APP_EVENTS } from '@nxt1/core/analytics';
import type { AnalyticsAdapter } from '@nxt1/core/analytics';
import { HapticsService } from '../services/haptics/haptics.service';
import { NxtToastService } from '../services/toast/toast.service';
import { NxtLoggingService } from '../services/logging/logging.service';
import { NxtBrowserService } from '../services/browser/browser.service';
import { NxtBreadcrumbService } from '../services/breadcrumb';
import { ANALYTICS_ADAPTER } from '../services/analytics/analytics-adapter.token';
import { NxtBottomSheetService } from '../components/bottom-sheet';
import { AgentXJobService, isEnqueueFailure } from '../agent-x/agent-x-job.service';
import {
  SETTINGS_PERSISTENCE_ADAPTER,
  type SettingsPersistenceAdapter,
} from './settings-persistence-adapter';

/**
 * Thrown by a SettingsPersistenceAdapter when the user explicitly cancels an
 * interactive operation (e.g. biometric enrollment prompt).  The service will
 * rollback the optimistic update silently — no error toast is shown.
 */
export class UserCancelledError extends Error {
  readonly userCancelled = true;
  constructor(message = 'User cancelled') {
    super(message);
    this.name = 'UserCancelledError';
  }
}

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
  private readonly agentXJobService = inject(AgentXJobService);
  private readonly persistence: SettingsPersistenceAdapter | null =
    inject(SETTINGS_PERSISTENCE_ADAPTER, { optional: true }) ?? null;
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
   * Override items for a specific section.
   * Used by web wrapper to inline account items on desktop instead of navigating to child routes.
   */
  overrideSectionItems(sectionId: SettingsSectionId, items: readonly SettingsItem[]): void {
    this._sections.update((sections) =>
      sections.map((section) => (section.id === sectionId ? { ...section, items } : section))
    );
  }

  /**
   * Set user info from platform-specific auth service.
   * Call this from the web/mobile wrapper before the shell initializes.
   * Automatically filters sections based on the user's role — athletes,
   * parents, and recruiters will not see billing/usage sections.
   */
  setUser(user: SettingsUserInfo | null): void {
    this._user.set(user);
    this._sections.set(getSettingsSectionsForRole(user?.role));
    this.logger.debug('User info set', { userId: user?.id ?? null, role: user?.role ?? null });
  }

  /**
   * Set preferences from platform-specific persistence adapter.
   * Also updates section items to reflect the new values.
   */
  setPreferences(prefs: SettingsPreferences): void {
    this._preferences.set(prefs);
    this.updateSectionsWithPreferences();
    this.logger.debug('Preferences set from adapter');
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

      // Load persisted preferences via platform adapter (web/mobile)
      if (this.persistence) {
        try {
          const persisted = await this.persistence.loadPreferences();
          this._preferences.set(persisted);
        } catch (prefErr) {
          this.logger.warn('Failed to load persisted preferences, using defaults', {
            error: prefErr instanceof Error ? prefErr.message : String(prefErr),
          });
          this._preferences.set(DEFAULT_SETTINGS_PREFERENCES);
        }
      } else {
        this._preferences.set(DEFAULT_SETTINGS_PREFERENCES);
      }

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

      // Persist via platform adapter
      if (this.persistence) {
        await this.persistence.updatePreference(key, value);
      }

      await this.haptics.notification('success');
      this.logger.info('Preference updated', { key, value });
    } catch (err) {
      // Rollback on error
      this._preferences.set(previous);
      this.updateSectionsWithPreferences();

      // User explicitly cancelled (e.g. biometric enrollment prompt) — rollback silently
      if (err instanceof UserCancelledError) {
        this.logger.debug('Preference update cancelled by user', { key });
        return;
      }

      const message = err instanceof Error ? err.message : 'Failed to update preference';
      this.toast.error(message);
      this.logger.error('Failed to update preference', err, { key, value });
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
   * Request an immediate user-triggered re-sync of connected accounts.
   */
  async requestConnectedAccountsResync(
    accounts: ReadonlyArray<{
      platform: string;
      label?: string;
      username?: string;
      url?: string;
      connected?: boolean;
    }> = []
  ): Promise<void> {
    const requestedAccounts = accounts
      .filter((account) => account.connected || !!account.username || !!account.url)
      .map((account) => ({
        platform: account.platform,
        label: account.label ?? account.platform,
        username: account.username,
        url: account.url,
      }));

    const platformSummary = requestedAccounts.map((account) => account.label).join(', ');
    const intent =
      requestedAccounts.length > 0
        ? `Re-sync my connected accounts right now. Refresh these linked accounts: ${platformSummary}. Pull in the latest public updates and update my NXT1 profile with any changed data.`
        : 'Re-sync all of my connected accounts right now. Review the accounts linked on my NXT1 profile, pull in the latest public updates, and refresh my profile with any changed data.';

    this.logger.info('Requesting connected accounts re-sync', {
      requestedAccountCount: requestedAccounts.length,
      platforms: requestedAccounts.map((account) => account.platform),
    });
    this.breadcrumb.trackUserAction('settings:connected-accounts-resync');

    try {
      const job = await this.agentXJobService.enqueue(intent, {
        source: 'settings_connected_accounts',
        trigger: 'manual_resync',
        requestedAt: new Date().toISOString(),
        requestedAccounts,
      });

      if (isEnqueueFailure(job)) {
        this.toast.error(
          job.reason === 'billing'
            ? job.message
            : 'Unable to start re-sync right now. Please try again.'
        );
        this.logger.warn('Connected accounts re-sync enqueue failed', { reason: job.reason });
        return;
      }

      await this.haptics.notification('success');
      this.toast.success('Re-sync started. Agent X is refreshing your connected accounts.');
      this.logger.info('Connected accounts re-sync enqueued', {
        jobId: job.jobId,
        operationId: job.operationId,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to start re-sync';
      this.toast.error('Unable to start re-sync right now. Please try again.');
      this.logger.error('Failed to request connected accounts re-sync', err, {
        requestedAccountCount: requestedAccounts.length,
      });
      this._error.set(message);
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

      // Replace with a real version API call when available
      const updateAvailable = false;
      const currentVersion = '2.0.0';

      const result = await this.bottomSheet.show({
        title: updateAvailable ? 'Update available' : 'App is up to date',
        subtitle: `Version ${currentVersion}`,
        icon: updateAvailable ? 'cloud-download-outline' : 'checkmark-circle-outline',
        showClose: false,
        actionsLayout: 'row',
        actions: updateAvailable
          ? [
              { label: 'Update', role: 'primary' as const },
              { label: 'Later', role: 'cancel' as const },
            ]
          : [{ label: 'Got it', role: 'cancel' as const }],
        breakpoints: [0, 0.18],
        initialBreakpoint: 0.18,
        backdropBreakpoint: 0,
      });

      if (!result.confirmed) return;

      if (isPlatformBrowser(this.platformId)) {
        window.location.reload();
        return;
      }

      this.toast.info('Update available in the App Store.');
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
    void this.haptics.impact('light');

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
    void this.haptics.impact('light');

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

          return item;
        }),
      }))
    );
  }
}
