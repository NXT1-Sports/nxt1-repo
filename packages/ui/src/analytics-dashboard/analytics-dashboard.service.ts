/**
 * @fileoverview Analytics Dashboard Service - Shared State Management
 * @module @nxt1/ui/analytics-dashboard
 * @version 1.0.0
 *
 * Signal-based state management for Analytics Dashboard feature.
 * Shared between web and mobile applications.
 *
 * Features:
 * - Reactive state with Angular signals
 * - Tab-based navigation
 * - Period selection
 * - Cached data with TTL
 * - Pull-to-refresh support
 * - Role-based content (athlete vs coach)
 *
 * @example
 * ```typescript
 * @Component({...})
 * export class AnalyticsPageComponent {
 *   private readonly analytics = inject(AnalyticsDashboardService);
 *
 *   readonly report = this.analytics.report;
 *   readonly isLoading = this.analytics.isLoading;
 *   readonly activeTab = this.analytics.activeTab;
 *
 *   async onPeriodChange(period: AnalyticsPeriod): Promise<void> {
 *     await this.analytics.loadReport(period);
 *   }
 * }
 * ```
 */

import { Injectable, inject, signal, computed, OnDestroy } from '@angular/core';
import {
  type AnalyticsReport,
  type AthleteAnalyticsReport,
  type CoachAnalyticsReport,
  type AnalyticsPeriod,
  type AnalyticsTabId,
  type AnalyticsUserRole,
  type MetricCard,
  type AnalyticsInsight,
  type AnalyticsRecommendation,
  ANALYTICS_DEFAULT_TAB,
  ANALYTICS_DEFAULT_PERIOD,
  ANALYTICS_CACHE_TTL,
  getTabsForRole,
  isAthleteReport,
  isCoachReport,
  isTeamRole,
} from '@nxt1/core';
import { HapticsService } from '../services/haptics/haptics.service';
import { NxtToastService } from '../services/toast/toast.service';
import { NxtLoggingService } from '../services/logging/logging.service';

/**
 * Analytics Dashboard state management service.
 * Provides reactive state for the analytics interface.
 */
@Injectable({ providedIn: 'root' })
export class AnalyticsDashboardService implements OnDestroy {
  // private readonly api = inject(AnalyticsDashboardApiService);
  private readonly haptics = inject(HapticsService);
  private readonly toast = inject(NxtToastService);
  private readonly logger = inject(NxtLoggingService).child('AnalyticsDashboardService');

  // ============================================
  // PRIVATE WRITEABLE SIGNALS
  // ============================================

  private readonly _report = signal<AnalyticsReport | null>(null);
  private readonly _activeTab = signal<AnalyticsTabId>(ANALYTICS_DEFAULT_TAB);
  private readonly _selectedPeriod = signal<AnalyticsPeriod>(ANALYTICS_DEFAULT_PERIOD);
  private readonly _userRole = signal<AnalyticsUserRole>('athlete');
  private readonly _isLoading = signal(true);
  private readonly _isRefreshing = signal(false);
  private readonly _error = signal<string | null>(null);
  private readonly _lastRefresh = signal<Date | null>(null);
  private readonly _initialized = signal(false);

  // Cache management
  private _cacheTimestamp = 0;
  private _cachedPeriod: AnalyticsPeriod | null = null;
  private _cachedRole: AnalyticsUserRole | null = null;

  // ============================================
  // PUBLIC READONLY COMPUTED SIGNALS
  // ============================================

  /** Current analytics report */
  readonly report = computed(() => this._report());

  /** Currently active tab */
  readonly activeTab = computed(() => this._activeTab());

  /** Currently selected time period */
  readonly selectedPeriod = computed(() => this._selectedPeriod());

  /** User role (athlete or coach) */
  readonly userRole = computed(() => this._userRole());

  /** Whether the current view is athlete-oriented (for template role checks) */
  readonly isAthleteView = computed(() => !isTeamRole(this._userRole()));

  /** Whether initial load is in progress */
  readonly isLoading = computed(() => this._isLoading());

  /** Whether refreshing data */
  readonly isRefreshing = computed(() => this._isRefreshing());

  /** Current error message */
  readonly error = computed(() => this._error());

  /** Last refresh timestamp */
  readonly lastRefresh = computed(() => this._lastRefresh());

  /** Whether data is empty (only after first load attempt completes) */
  readonly isEmpty = computed(() => this._initialized() && !this._report() && !this._isLoading());

  /** Available tabs based on user role */
  readonly availableTabs = computed(() => {
    const role = this._userRole();
    // Parents see athlete view, so map to 'athlete' for tab filtering
    const tabRole: 'athlete' | 'coach' = isTeamRole(role) ? 'coach' : 'athlete';
    return getTabsForRole(tabRole);
  });

  // ============================================
  // REPORT TYPE-SPECIFIC COMPUTED SIGNALS
  // ============================================

  /** Athlete report (null if coach) */
  readonly athleteReport = computed((): AthleteAnalyticsReport | null => {
    const report = this._report();
    return report && isAthleteReport(report) ? report : null;
  });

  /** Coach report (null if athlete) */
  readonly coachReport = computed((): CoachAnalyticsReport | null => {
    const report = this._report();
    return report && isCoachReport(report) ? report : null;
  });

  /** Overview metric cards (works for both roles) */
  readonly overviewCards = computed((): MetricCard[] => {
    const report = this._report();
    if (!report) return [];

    if (isAthleteReport(report)) {
      return Object.values(report.overview);
    } else {
      return Object.values(report.overviewCards);
    }
  });

  /** Current insights */
  readonly insights = computed((): readonly AnalyticsInsight[] => {
    return this._report()?.insights ?? [];
  });

  /** Current recommendations */
  readonly recommendations = computed((): readonly AnalyticsRecommendation[] => {
    return this._report()?.recommendations ?? [];
  });

  // ============================================
  // PUBLIC METHODS
  // ============================================

  /**
   * Initialize analytics for a user.
   * Call this when entering the analytics page.
   *
   * @param role - User role (athlete or coach)
   * @param userId - User ID (optional, uses auth if not provided)
   */
  async initialize(role: AnalyticsUserRole, userId?: string): Promise<void> {
    this.logger.info('Initializing analytics', { role, userId });
    this._userRole.set(role);
    await this.loadReport(this._selectedPeriod(), false);
  }

  /**
   * Load analytics report for selected period.
   *
   * @param period - Time period to load
   * @param forceRefresh - Skip cache and fetch fresh data
   */
  async loadReport(
    period: AnalyticsPeriod = this._selectedPeriod(),
    forceRefresh = false
  ): Promise<void> {
    const role = this._userRole();

    // Check cache
    const now = Date.now();
    const cacheValid =
      !forceRefresh &&
      this._cachedPeriod === period &&
      this._cachedRole === role &&
      now - this._cacheTimestamp < ANALYTICS_CACHE_TTL.REPORT;

    if (cacheValid && this._report()) {
      this.logger.debug('Using cached analytics report');
      return;
    }

    this._isLoading.set(true);
    this._error.set(null);
    this._selectedPeriod.set(period);

    try {
      // TODO: Connect real API
      // const report = await this.api.getReport({ userId, role, period });

      // No data available yet
      const report = null;

      // Update cache
      this._cacheTimestamp = now;
      this._cachedPeriod = period;
      this._cachedRole = role;

      // Update state
      if (report) this._report.set(report);
      this._lastRefresh.set(new Date());
      this._error.set(null);

      this.logger.info('Analytics report loaded', { role, period });
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load analytics';
      this.logger.error('Failed to load analytics report', err);
      this._error.set(errorMessage);
      this.toast.error('Failed to load analytics. Please try again.');
    } finally {
      this._isLoading.set(false);
      this._initialized.set(true);
    }
  }

  /**
   * Refresh current report (pull-to-refresh).
   */
  async refresh(): Promise<void> {
    if (this._isRefreshing()) return;

    this._isRefreshing.set(true);
    await this.haptics.impact('light');

    try {
      await this.loadReport(this._selectedPeriod(), true);
      await this.haptics.notification('success');
    } catch {
      await this.haptics.notification('error');
    } finally {
      this._isRefreshing.set(false);
    }
  }

  /**
   * Change the active tab.
   *
   * @param tab - Tab to switch to
   */
  setActiveTab(tab: AnalyticsTabId): void {
    if (this._activeTab() !== tab) {
      this._activeTab.set(tab);
      this.haptics.selection();
      this.logger.debug('Analytics tab changed', { tab });
    }
  }

  /**
   * Change the time period and reload data.
   *
   * @param period - New time period
   */
  async setPeriod(period: AnalyticsPeriod): Promise<void> {
    if (this._selectedPeriod() !== period) {
      await this.haptics.selection();
      await this.loadReport(period, false);
    }
  }

  /**
   * Clear cached data.
   */
  clearCache(): void {
    this._cacheTimestamp = 0;
    this._cachedPeriod = null;
    this._cachedRole = null;
    this.logger.debug('Analytics cache cleared');
  }

  /**
   * Reset to default state.
   */
  reset(): void {
    this._report.set(null);
    this._activeTab.set(ANALYTICS_DEFAULT_TAB);
    this._selectedPeriod.set(ANALYTICS_DEFAULT_PERIOD);
    this._isLoading.set(true);
    this._isRefreshing.set(false);
    this._error.set(null);
    this._lastRefresh.set(null);
    this._initialized.set(false);
    this.clearCache();
    this.logger.debug('Analytics state reset');
  }

  /**
   * Cleanup on service destruction.
   */
  ngOnDestroy(): void {
    this.reset();
    this.logger.debug('AnalyticsDashboardService destroyed');
  }
}
