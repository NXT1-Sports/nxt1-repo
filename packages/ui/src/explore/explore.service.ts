/**
 * @fileoverview Explore Service - Shared State Management
 * @module @nxt1/ui/explore
 * @version 1.0.0
 *
 * Signal-based state management for Explore/Search feature.
 * Shared between web and mobile applications.
 *
 * Features:
 * - Reactive state with Angular signals
 * - Tab-based search results
 * - Search query management
 * - Infinite scroll pagination
 * - Recent searches tracking
 * - Trending searches
 *
 * @example
 * ```typescript
 * @Component({...})
 * export class ExplorePageComponent {
 *   private readonly explore = inject(ExploreService);
 *
 *   readonly items = this.explore.items;
 *   readonly isLoading = this.explore.isLoading;
 *   readonly activeTab = this.explore.activeTab;
 *
 *   async onSearch(query: string): Promise<void> {
 *     await this.explore.search(query);
 *   }
 * }
 * ```
 */

import { Injectable, inject, signal, computed } from '@angular/core';
import {
  type ExploreItem,
  type ExploreTabId,
  type ExploreFilters,
  type ExplorePagination,
  type ExploreTabCounts,
  EXPLORE_DEFAULT_TAB,
  EXPLORE_TABS,
  EXPLORE_PAGINATION_DEFAULTS,
  EXPLORE_SEARCH_CONFIG,
  EXPLORE_INITIAL_TAB_COUNTS,
  isFeedTab,
} from '@nxt1/core';
import { HapticsService } from '../services/haptics/haptics.service';
import { NxtToastService } from '../services/toast/toast.service';
import { NxtLoggingService } from '../services/logging/logging.service';

// ⚠️ TEMPORARY: Mock data for development (remove when backend is ready)
import {
  getMockExploreItems,
  getMockItemCount,
  getMockTabCounts,
  getMockSuggestions,
  MOCK_TRENDING_SEARCHES,
  MOCK_RECENT_SEARCHES,
} from './explore.mock-data';

/**
 * Explore state management service.
 * Provides reactive state for the explore/search interface.
 */
@Injectable({ providedIn: 'root' })
export class ExploreService {
  private readonly haptics = inject(HapticsService);
  private readonly toast = inject(NxtToastService);
  private readonly logger = inject(NxtLoggingService).child('ExploreService');

  // ============================================
  // PRIVATE WRITEABLE SIGNALS
  // ============================================

  private readonly _query = signal('');
  private readonly _items = signal<ExploreItem[]>([]);
  private readonly _activeTab = signal<ExploreTabId>(EXPLORE_DEFAULT_TAB);
  private readonly _tabCounts = signal<ExploreTabCounts>(EXPLORE_INITIAL_TAB_COUNTS);
  private readonly _isLoading = signal(false);
  private readonly _isLoadingMore = signal(false);
  private readonly _isSearchFocused = signal(false);
  private readonly _error = signal<string | null>(null);
  private readonly _pagination = signal<ExplorePagination | null>(null);
  private readonly _recentSearches = signal<string[]>(MOCK_RECENT_SEARCHES);
  private readonly _trendingSearches = signal<string[]>(MOCK_TRENDING_SEARCHES);
  private readonly _suggestions = signal<string[]>([]);
  private readonly _tabFilters = signal<Record<ExploreTabId, ExploreFilters>>({
    'for-you': {},
    feed: {},
    following: {},
    news: {},
    colleges: {},
    athletes: {},
    teams: {},
    videos: {},
    leaderboards: {},
    'scout-reports': {},
    camps: {},
    events: {},
  });

  // ============================================
  // PUBLIC READONLY COMPUTED SIGNALS
  // ============================================

  /** Current search query */
  readonly query = computed(() => this._query());

  /** Current explore items */
  readonly items = computed(() => this._items());

  /** Currently active tab */
  readonly activeTab = computed(() => this._activeTab());

  /** Tab counts */
  readonly tabCounts = computed(() => this._tabCounts());

  /** Whether initial load is in progress */
  readonly isLoading = computed(() => this._isLoading());

  /** Whether loading more items */
  readonly isLoadingMore = computed(() => this._isLoadingMore());

  /** Whether search input is focused */
  readonly isSearchFocused = computed(() => this._isSearchFocused());

  /** Current error message */
  readonly error = computed(() => this._error());

  /** Current pagination info */
  readonly pagination = computed(() => this._pagination());

  /** Recent searches */
  readonly recentSearches = computed(() => this._recentSearches());

  /** Trending searches */
  readonly trendingSearches = computed(() => this._trendingSearches());

  /** Search suggestions */
  readonly suggestions = computed(() => this._suggestions());

  /** Active filters per tab */
  readonly tabFilters = computed(() => this._tabFilters());

  /** Whether results are empty */
  readonly isEmpty = computed(() => this._items().length === 0 && !this._isLoading());

  /** Whether there's an active search query */
  readonly hasQuery = computed(() => this._query().length >= EXPLORE_SEARCH_CONFIG.minQueryLength);

  /** Whether there are more items to load */
  readonly hasMore = computed(() => this._pagination()?.hasMore ?? false);

  /** Count for current tab */
  readonly currentTabCount = computed(() => {
    const tab = this._activeTab();
    return this._tabCounts()[tab] ?? 0;
  });

  /** Tabs with counts merged */
  readonly tabsWithCounts = computed(() => {
    const counts = this._tabCounts();
    return EXPLORE_TABS.map((tab) => ({
      ...tab,
      count: counts[tab.id] ?? 0,
    }));
  });

  // ============================================
  // PUBLIC METHODS
  // ============================================

  /**
   * Perform a search with the given query.
   *
   * @param query - Search query string
   */
  async search(query: string): Promise<void> {
    this._query.set(query);
    this._items.set([]);
    this._error.set(null);
    this._isLoading.set(true);
    this._pagination.set(null);

    const tab = this._activeTab();
    const filters = this._tabFilters()[tab] ?? {};
    this.logger.debug('Searching', { query, tab, filters });

    try {
      // Simulate network delay
      await new Promise((resolve) => setTimeout(resolve, 400));

      // ⚠️ TEMPORARY: Using mock data
      const items = getMockExploreItems(tab, 1, EXPLORE_PAGINATION_DEFAULTS.pageSize, query);
      const counts = getMockTabCounts(query);
      const total = getMockItemCount(tab, query);
      const totalPages = Math.ceil(total / EXPLORE_PAGINATION_DEFAULTS.pageSize);
      const hasMore = items.length < total;

      this._items.set(items);
      this._tabCounts.set(counts);
      this._pagination.set({
        page: 1,
        limit: EXPLORE_PAGINATION_DEFAULTS.pageSize,
        total,
        totalPages,
        hasMore,
      });

      // Add to recent searches if query is valid
      if (query && query.length >= EXPLORE_SEARCH_CONFIG.minQueryLength) {
        this.addToRecentSearches(query);
      }

      await this.haptics.impact('light');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Search failed';
      this._error.set(message);
      this.logger.error('Search failed', err, { query, tab });
    } finally {
      this._isLoading.set(false);
    }
  }

  /**
   * Switch to a different tab.
   *
   * @param tab - Tab ID to switch to
   */
  async switchTab(tab: ExploreTabId): Promise<void> {
    if (tab === this._activeTab()) return;

    this._activeTab.set(tab);
    await this.haptics.impact('light');

    // For-You and feed tabs are handled by their own components/services
    if (tab === 'for-you' || isFeedTab(tab)) return;

    // Re-search with current query for discovery tabs
    const query = this._query();
    await this.search(query);
  }

  /**
   * Load more items (infinite scroll).
   */
  async loadMore(): Promise<void> {
    const pagination = this._pagination();
    if (!pagination?.hasMore || this._isLoadingMore() || this._isLoading()) {
      return;
    }

    this._isLoadingMore.set(true);
    const tab = this._activeTab();
    const query = this._query();
    const nextPage = pagination.page + 1;

    this.logger.debug('Loading more', { tab, page: nextPage, query });

    try {
      // Simulate network delay
      await new Promise((resolve) => setTimeout(resolve, 300));

      // ⚠️ TEMPORARY: Using mock data
      const items = getMockExploreItems(tab, nextPage, EXPLORE_PAGINATION_DEFAULTS.pageSize, query);
      const total = getMockItemCount(tab, query);
      const totalPages = Math.ceil(total / EXPLORE_PAGINATION_DEFAULTS.pageSize);
      const hasMore = nextPage * EXPLORE_PAGINATION_DEFAULTS.pageSize < total;

      this._items.update((current) => [...current, ...items]);
      this._pagination.set({
        page: nextPage,
        limit: EXPLORE_PAGINATION_DEFAULTS.pageSize,
        total,
        totalPages,
        hasMore,
      });
    } catch (err) {
      this.logger.error('Load more failed', err, { tab, page: nextPage });
      this.toast.error('Failed to load more results');
    } finally {
      this._isLoadingMore.set(false);
    }
  }

  /**
   * Refresh the current search.
   */
  async refresh(): Promise<void> {
    await this.search(this._query());
  }

  /**
   * Update search suggestions.
   *
   * @param query - Query to get suggestions for
   */
  async updateSuggestions(query: string): Promise<void> {
    if (!query || query.length < EXPLORE_SEARCH_CONFIG.minQueryLength) {
      this._suggestions.set([]);
      return;
    }

    // ⚠️ TEMPORARY: Using mock data
    const suggestions = getMockSuggestions(query, EXPLORE_SEARCH_CONFIG.maxSuggestions);
    this._suggestions.set(suggestions);
  }

  /**
   * Clear suggestions.
   */
  clearSuggestions(): void {
    this._suggestions.set([]);
  }

  /**
   * Set search focus state.
   */
  setSearchFocused(focused: boolean): void {
    this._isSearchFocused.set(focused);
  }

  /**
   * Clear current search.
   */
  clearSearch(): void {
    this._query.set('');
    this._items.set([]);
    this._tabCounts.set(EXPLORE_INITIAL_TAB_COUNTS);
    this._pagination.set(null);
    this._suggestions.set([]);
    this._error.set(null);
  }

  /**
   * Clear error state.
   */
  clearError(): void {
    this._error.set(null);
  }

  /**
   * Add a query to recent searches.
   */
  private addToRecentSearches(query: string): void {
    const current = this._recentSearches();
    const filtered = current.filter((s) => s.toLowerCase() !== query.toLowerCase());
    const updated = [query, ...filtered].slice(0, EXPLORE_SEARCH_CONFIG.maxRecentSearches);
    this._recentSearches.set(updated);

    // In production: persist to storage
    // this.storage.set(EXPLORE_CACHE_KEYS.recentSearches, updated);
  }

  /**
   * Remove a query from recent searches.
   */
  removeFromRecentSearches(query: string): void {
    this._recentSearches.update((current) =>
      current.filter((s) => s.toLowerCase() !== query.toLowerCase())
    );
  }

  /**
   * Clear all recent searches.
   */
  clearRecentSearches(): void {
    this._recentSearches.set([]);
  }

  /**
   * Get active filters for a specific tab.
   */
  getFiltersForTab(tab: ExploreTabId): ExploreFilters {
    return this._tabFilters()[tab] ?? {};
  }

  /**
   * Set filters for a specific tab.
   */
  setFiltersForTab(tab: ExploreTabId, filters: ExploreFilters): void {
    const normalized = this.normalizeFilters(filters);
    this._tabFilters.update((current) => ({
      ...current,
      [tab]: normalized,
    }));
  }

  /**
   * Clear filters for a specific tab.
   */
  clearFiltersForTab(tab: ExploreTabId): void {
    this._tabFilters.update((current) => ({
      ...current,
      [tab]: {},
    }));
  }

  /**
   * Count active filters for a specific tab.
   */
  getActiveFilterCount(tab: ExploreTabId): number {
    const filters = this._tabFilters()[tab] ?? {};
    let count = 0;

    if (filters.sport) count += 1;
    if (filters.state) count += 1;
    if (filters.division) count += 1;
    if (filters.position) count += 1;
    if (typeof filters.classYear === 'number') count += 1;
    if (typeof filters.radius === 'number') count += 1;
    if (filters.verifiedOnly === true) count += 1;

    return count;
  }

  private normalizeFilters(filters: ExploreFilters): ExploreFilters {
    return {
      ...(filters.sport?.trim() ? { sport: filters.sport.trim() } : {}),
      ...(filters.state?.trim() ? { state: filters.state.trim().toUpperCase() } : {}),
      ...(filters.division?.trim() ? { division: filters.division.trim() } : {}),
      ...(filters.position?.trim() ? { position: filters.position.trim() } : {}),
      ...(typeof filters.classYear === 'number' ? { classYear: filters.classYear } : {}),
      ...(typeof filters.radius === 'number' ? { radius: filters.radius } : {}),
      ...(filters.verifiedOnly === true ? { verifiedOnly: true } : {}),
    };
  }
}
