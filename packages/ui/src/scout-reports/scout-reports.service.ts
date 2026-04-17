/**
 * @fileoverview Scout Reports Service - Shared State Management
 * @module @nxt1/ui/scout-reports
 * @version 1.0.0
 *
 * Signal-based state management for Scout Reports feature.
 * Shared between web and mobile applications.
 *
 * Features:
 * - Reactive state with Angular signals
 * - Category-based feed management
 * - Badge counts tracking
 * - Infinite scroll pagination
 * - Bookmark functionality
 * - Pull-to-refresh support
 * - XP reward tracking
 *
 * @example
 * ```typescript
 * @Component({...})
 * export class ScoutReportsPageComponent {
 *   private readonly scoutReports = inject(ScoutReportsService);
 *
 *   readonly reports = this.scoutReports.reports;
 *   readonly isLoading = this.scoutReports.isLoading;
 *   readonly activeCategory = this.scoutReports.activeCategory;
 *
 *   async onCategoryChange(categoryId: ScoutReportCategoryId): Promise<void> {
 *     await this.scoutReports.loadReports(categoryId);
 *   }
 * }
 * ```
 */

import { Injectable, inject, signal, computed } from '@angular/core';
import {
  type ScoutReport,
  type ScoutReportCategoryId,
  type ScoutReportPagination,
  type ScoutReportFilter,
  type ScoutReportViewMode,
  SCOUT_REPORT_DEFAULT_CATEGORY,
  SCOUT_REPORT_CATEGORIES,
  SCOUT_REPORT_PAGINATION_DEFAULTS,
  SCOUT_REPORT_LAYOUT_DEFAULTS,
  buildFilterFromCategory,
  countActiveFilters,
} from '@nxt1/core';
import { HapticsService } from '../services/haptics/haptics.service';
import { NxtToastService } from '../services/toast/toast.service';
import type { ScoutReportSortOption } from './scout-report-sort-selector.component';
import { NxtLoggingService } from '../services/logging/logging.service';

/**
 * Scout Reports state management service.
 * Provides reactive state for the scout reports interface.
 */
@Injectable({ providedIn: 'root' })
export class ScoutReportsService {
  // TODO: inject ScoutReportsApiService when backend is ready
  private readonly haptics = inject(HapticsService);
  private readonly toast = inject(NxtToastService);
  private readonly logger = inject(NxtLoggingService).child('ScoutReportsService');

  // ============================================
  // PRIVATE WRITEABLE SIGNALS
  // ============================================

  private readonly _reports = signal<ScoutReport[]>([]);
  private readonly _selectedReport = signal<ScoutReport | null>(null);
  private readonly _activeCategory = signal<ScoutReportCategoryId>(SCOUT_REPORT_DEFAULT_CATEGORY);
  private readonly _badges = signal<Record<ScoutReportCategoryId, number>>(
    {} as Record<ScoutReportCategoryId, number>
  );
  private readonly _filters = signal<ScoutReportFilter>({});
  private readonly _isLoading = signal(false);
  private readonly _isLoadingMore = signal(false);
  private readonly _isRefreshing = signal(false);
  private readonly _error = signal<string | null>(null);
  private readonly _pagination = signal<ScoutReportPagination | null>(null);
  private readonly _viewMode = signal<ScoutReportViewMode>(SCOUT_REPORT_LAYOUT_DEFAULTS.viewMode);
  private readonly _searchQuery = signal<string>('');
  private readonly _isFilterPanelOpen = signal(false);
  private readonly _sortOption = signal<ScoutReportSortOption>('rating-desc');

  // ============================================
  // PUBLIC READONLY COMPUTED SIGNALS
  // ============================================

  /** Current scout reports */
  readonly reports = computed(() => this._reports());

  /** Currently selected report for detail view */
  readonly selectedReport = computed(() => this._selectedReport());

  /** Currently active category */
  readonly activeCategory = computed(() => this._activeCategory());

  /** Badge counts per category */
  readonly badges = computed(() => this._badges());

  /** Current filters */
  readonly filter = computed(() => this._filters());

  /** Current filters (alias) */
  readonly filters = computed(() => this._filters());

  /** Whether initial load is in progress */
  readonly isLoading = computed(() => this._isLoading());

  /** Whether loading more items */
  readonly isLoadingMore = computed(() => this._isLoadingMore());

  /** Whether refreshing */
  readonly isRefreshing = computed(() => this._isRefreshing());

  /** Current error message */
  readonly error = computed(() => this._error());

  /** Current pagination info */
  readonly pagination = computed(() => this._pagination());

  /** Whether the feed is empty */
  readonly isEmpty = computed(() => this._reports().length === 0 && !this._isLoading());

  /** Whether there are more items to load */
  readonly hasMore = computed(() => this._pagination()?.hasMore ?? false);

  /** Current view mode */
  readonly viewMode = computed(() => this._viewMode());

  /** Current search query */
  readonly searchQuery = computed(() => this._searchQuery());

  /** Whether filter panel is open */
  readonly isFilterPanelOpen = computed(() => this._isFilterPanelOpen());

  /** Number of active filters */
  readonly activeFilterCount = computed(() => countActiveFilters(this._filters()));

  /** Total reports count */
  readonly totalReports = computed(() => this._pagination()?.total ?? 0);

  /** Total reports count (alias for shell) */
  readonly totalCount = computed(() => this._pagination()?.total ?? 0);

  /** Current sort option */
  readonly sortOption = computed(() => this._sortOption());

  /** Badge count for current category */
  readonly currentCategoryBadge = computed(() => {
    const category = this._activeCategory();
    return this._badges()[category] ?? 0;
  });

  /** Categories with badge counts merged */
  readonly categoriesWithBadges = computed(() => {
    const badges = this._badges();
    return SCOUT_REPORT_CATEGORIES.map((cat) => ({
      ...cat,
      badge: badges[cat.id] ?? 0,
    }));
  });

  /** Verified reports */
  readonly verifiedReports = computed(() => {
    return this._reports().filter((report) => report.isVerified);
  });

  // ============================================
  // PUBLIC METHODS
  // ============================================

  /**
   * Load scout reports for a category.
   * Resets reports and loads fresh data.
   *
   * @param category - Category ID to load (defaults to current category)
   */
  async loadReports(category?: ScoutReportCategoryId): Promise<void> {
    const targetCategory = category ?? this._activeCategory();
    this._activeCategory.set(targetCategory);
    this._reports.set([]);
    this._error.set(null);
    this._isLoading.set(true);
    this._pagination.set(null);

    // Apply category-based filters
    const categoryFilter = buildFilterFromCategory(targetCategory);
    this._filters.update((f) => ({ ...f, ...categoryFilter }));

    this.logger.debug('Loading scout reports', { category: targetCategory });

    try {
      // TODO: replace with API call when backend is ready
      this._reports.set([]);
      this._pagination.set({
        page: 1,
        limit: SCOUT_REPORT_PAGINATION_DEFAULTS.pageSize,
        total: 0,
        totalPages: 0,
        hasMore: false,
      });
      await this.haptics.impact('light');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load scout reports';
      this._error.set(message);
      this.logger.error('Failed to load scout reports', err, { category });
    } finally {
      this._isLoading.set(false);
    }
  }

  /**
   * Load a single report by ID for detail view.
   *
   * @param reportId - Report ID to load
   */
  async loadReport(reportId: string): Promise<void> {
    this._isLoading.set(true);
    this._error.set(null);

    try {
      // TODO: replace with API call when backend is ready
      const report = this._reports().find((r) => r.id === reportId) ?? null;
      this._selectedReport.set(report);
      if (!report) {
        this._error.set('Report not found');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load report';
      this._error.set(message);
      this.logger.error('Failed to load report', err, { reportId });
    } finally {
      this._isLoading.set(false);
    }
  }

  /**
   * Clear selected report.
   */
  clearSelectedReport(): void {
    this._selectedReport.set(null);
  }

  /**
   * Load more reports (infinite scroll).
   * Appends reports to existing list.
   */
  async loadMore(): Promise<void> {
    const pagination = this._pagination();
    if (!pagination?.hasMore || this._isLoadingMore() || this._isLoading()) {
      return;
    }

    this._isLoadingMore.set(true);
    const category = this._activeCategory();
    const nextPage = pagination.page + 1;

    this.logger.debug('Loading more scout reports', { category, page: nextPage });

    try {
      // TODO: replace with API call when backend is ready
    } catch (err) {
      this.logger.error('Failed to load more reports', err);
    } finally {
      this._isLoadingMore.set(false);
    }
  }

  /**
   * Refresh current feed.
   * Reloads data for current category.
   */
  async refresh(): Promise<void> {
    this._isRefreshing.set(true);

    try {
      await this.loadReports(this._activeCategory());
      await this.haptics.notification('success');
    } finally {
      this._isRefreshing.set(false);
    }
  }

  /**
   * Track view of a report.
   * Awards XP if first view.
   *
   * @param reportId - Report ID being viewed
   */
  async trackView(reportId: string): Promise<void> {
    const report = this._reports().find((r) => r.id === reportId);
    if (!report || report.hasViewed) return;

    // Mark as viewed locally
    this._reports.update((reports) =>
      reports.map((r) =>
        r.id === reportId
          ? {
              ...r,
              hasViewed: true,
              viewCount: r.viewCount + 1,
            }
          : r
      )
    );

    try {
      // ⚠️ TEMPORARY: Simulate API call
      await new Promise((resolve) => setTimeout(resolve, 100));

      // XP earned toast would show here
      this.logger.debug('Report view tracked', { reportId, xp: report.xpReward });
    } catch (err) {
      this.logger.error('Failed to track view', err, { reportId });
    }
  }

  /**
   * Apply filters to reports.
   *
   * @param filters - Filter criteria
   */
  async applyFilters(filters: ScoutReportFilter): Promise<void> {
    this._filters.set(filters);
    await this.loadReports(this._activeCategory());
    this.closeFilterPanel();
  }

  /**
   * Clear all filters.
   */
  async clearFilters(): Promise<void> {
    this._filters.set({});
    await this.loadReports(this._activeCategory());
  }

  /**
   * Search reports by query.
   *
   * @param query - Search query
   */
  async search(query: string): Promise<void> {
    this._searchQuery.set(query);
    this._filters.update((f) => ({ ...f, searchQuery: query }));

    if (query.length >= 2) {
      await this.loadReports(this._activeCategory());
    }
  }

  /**
   * Clear search query.
   */
  clearSearch(): void {
    this._searchQuery.set('');
    this._filters.update((f) => {
      const { searchQuery: _searchQuery, ...rest } = f;
      return rest;
    });
  }

  /**
   * Set view mode.
   *
   * @param mode - View mode ('grid' | 'list' | 'compact')
   */
  setViewMode(mode: ScoutReportViewMode): void {
    this._viewMode.set(mode);
    this.haptics.impact('light');
  }

  /**
   * Set active category and reload.
   *
   * @param category - Category ID
   */
  async setCategory(category: ScoutReportCategoryId): Promise<void> {
    if (category === this._activeCategory()) return;
    await this.loadReports(category);
  }

  /**
   * Set filter and reload.
   *
   * @param filter - Filter criteria
   */
  async setFilter(filter: ScoutReportFilter): Promise<void> {
    await this.applyFilters(filter);
  }

  /**
   * Set search query.
   *
   * @param query - Search query
   */
  async setSearchQuery(query: string): Promise<void> {
    await this.search(query);
  }

  /**
   * Set sort option.
   *
   * @param option - Combined sort option string (e.g., 'rating-desc')
   */
  async setSortOption(option: string): Promise<void> {
    // Parse the combined option string
    const parts = option.split('-');
    const sortOrder = parts.pop() as 'asc' | 'desc';
    const sortBy = parts.join('-') as ScoutReportFilter['sortBy'];

    this._sortOption.set(option as ScoutReportSortOption);
    this._filters.update((f) => ({
      ...f,
      sortBy,
      sortOrder,
    }));
    await this.loadReports(this._activeCategory());
  }

  /**
   * Open filter panel.
   */
  openFilterPanel(): void {
    this._isFilterPanelOpen.set(true);
  }

  /**
   * Close filter panel.
   */
  closeFilterPanel(): void {
    this._isFilterPanelOpen.set(false);
  }

  /**
   * Toggle filter panel.
   */
  toggleFilterPanel(): void {
    this._isFilterPanelOpen.update((open) => !open);
  }

  /**
   * Clear badge for a category.
   *
   * @param category - Category to clear badge for
   */
  clearCategoryBadge(category: ScoutReportCategoryId): void {
    this._badges.update((badges) => ({
      ...badges,
      [category]: 0,
    }));
  }

  /**
   * Clear all badges.
   */
  clearAllBadges(): void {
    const clearedBadges = Object.fromEntries(
      Object.keys(this._badges()).map((key) => [key, 0])
    ) as Record<ScoutReportCategoryId, number>;
    this._badges.set(clearedBadges);
  }
}
