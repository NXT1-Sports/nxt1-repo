/**
 * @fileoverview Explore Service - Web App State Management
 * @module @nxt1/web/features/explore
 * @version 1.0.0
 *
 * Signal-based state management for Explore/Search feature.
 * Platform-specific implementation for web application.
 *
 * Features:
 * - Reactive state with Angular signals
 * - Tab-based search management
 * - Recent & trending searches
 * - Infinite scroll pagination
 * - Search debouncing
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
  EXPLORE_PAGINATION_DEFAULTS,
  EXPLORE_CACHE_KEYS,
} from '@nxt1/core';
import { HapticsService } from '@nxt1/ui/services/haptics';
import { NxtToastService } from '@nxt1/ui/services/toast';
import { NxtLoggingService } from '@nxt1/ui/services/logging';
import { ExploreApiService } from './explore-api.service';

/**
 * Explore state management service.
 * Provides reactive state for the explore/search interface.
 */
@Injectable({ providedIn: 'root' })
export class ExploreService {
  private readonly api = inject(ExploreApiService);
  private readonly haptics = inject(HapticsService);
  private readonly toast = inject(NxtToastService);
  private readonly logger = inject(NxtLoggingService).child('ExploreService');

  // ============================================
  // PRIVATE WRITEABLE SIGNALS
  // ============================================

  private readonly _items = signal<ExploreItem[]>([]);
  private readonly _activeTab = signal<ExploreTabId>('colleges');
  private readonly _query = signal('');
  private readonly _isLoading = signal(false);
  private readonly _isLoadingMore = signal(false);
  private readonly _isSearchFocused = signal(false);
  private readonly _error = signal<string | null>(null);
  private readonly _page = signal(1);
  private readonly _hasMore = signal(false);
  private readonly _recentSearches = signal<string[]>([]);
  private readonly _trendingSearches = signal<string[]>([]);

  // ============================================
  // PUBLIC READONLY COMPUTED SIGNALS
  // ============================================

  /** Current search results */
  readonly items = computed(() => this._items());

  /** Currently active tab */
  readonly activeTab = computed(() => this._activeTab());

  /** Current search query */
  readonly query = computed(() => this._query());

  /** Whether initial load is in progress */
  readonly isLoading = computed(() => this._isLoading());

  /** Whether loading more items */
  readonly isLoadingMore = computed(() => this._isLoadingMore());

  /** Whether search input is focused */
  readonly isSearchFocused = computed(() => this._isSearchFocused());

  /** Current error message */
  readonly error = computed(() => this._error());

  /** Whether there are more results to load */
  readonly hasMore = computed(() => this._hasMore());

  /** Recent user searches */
  readonly recentSearches = computed(() => this._recentSearches());

  /** Trending searches */
  readonly trendingSearches = computed(() => this._trendingSearches());

  /** Whether results are empty */
  readonly isEmpty = computed(() => this._items().length === 0 && !this._isLoading());

  /** Whether there's an active query */
  readonly hasQuery = computed(() => this._query().trim().length > 0);

  // ============================================
  // SEARCH METHODS
  // ============================================

  /**
   * Perform a search.
   */
  async search(query: string, tab?: ExploreTabId): Promise<void> {
    const searchQuery = query.trim();
    const searchTab = tab ?? this._activeTab();

    this._query.set(searchQuery);
    this._activeTab.set(searchTab);
    this._isLoading.set(true);
    this._error.set(null);
    this._page.set(1);

    try {
      const response = await this.api.search<ExploreItem>({
        query: searchQuery,
        tab: searchTab,
        page: 1,
        limit: EXPLORE_PAGINATION_DEFAULTS.pageSize,
      });

      if (response.success) {
        this._items.set([...response.items]);
        this._hasMore.set(response.pagination.hasMore);

        // Add to recent searches if not empty
        if (searchQuery && searchQuery.length >= 2) {
          this.addRecentSearch(searchQuery);
        }
      } else {
        this._error.set(response.error ?? 'Search failed');
        this._items.set([]);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Search failed';
      this._error.set(message);
      this._items.set([]);
      this.logger.error('Search failed', err);
    } finally {
      this._isLoading.set(false);
    }
  }

  /**
   * Load more results (pagination).
   */
  async loadMore(): Promise<void> {
    if (this._isLoadingMore() || !this._hasMore()) return;

    this._isLoadingMore.set(true);

    try {
      const nextPage = this._page() + 1;
      const response = await this.api.search<ExploreItem>({
        query: this._query(),
        tab: this._activeTab(),
        page: nextPage,
        limit: EXPLORE_PAGINATION_DEFAULTS.pageSize,
      });

      if (response.success) {
        this._items.update((items) => [...items, ...[...response.items]]);
        this._page.set(nextPage);
        this._hasMore.set(response.pagination.hasMore);
      }
    } catch (err) {
      this.logger.error('Load more failed', err);
      this.toast.error('Failed to load more results');
    } finally {
      this._isLoadingMore.set(false);
    }
  }

  /**
   * Change the active tab.
   */
  async setTab(tab: ExploreTabId): Promise<void> {
    if (tab === this._activeTab()) return;

    await this.haptics.impact('light');
    this._activeTab.set(tab);

    // Re-search with new tab if there's a query
    if (this.hasQuery()) {
      await this.search(this._query(), tab);
    }
  }

  /**
   * Set search focus state.
   */
  setSearchFocused(focused: boolean): void {
    this._isSearchFocused.set(focused);
  }

  /**
   * Clear search and results.
   */
  clearSearch(): void {
    this._query.set('');
    this._items.set([]);
    this._error.set(null);
    this._page.set(1);
    this._hasMore.set(false);
  }

  /**
   * Refresh current results.
   */
  async refresh(): Promise<void> {
    if (this.hasQuery()) {
      await this.search(this._query(), this._activeTab());
    }
  }

  // ============================================
  // SUGGESTIONS METHODS
  // ============================================

  /**
   * Load trending searches.
   */
  async loadTrendingSearches(): Promise<void> {
    try {
      const trending = await this.api.getTrendingSearches(10);
      this._trendingSearches.set(trending);
    } catch (err) {
      this.logger.error('Failed to load trending searches', err);
    }
  }

  /**
   * Add a search to recent searches.
   */
  private addRecentSearch(query: string): void {
    const recent = this._recentSearches();
    const filtered = recent.filter((s) => s.toLowerCase() !== query.toLowerCase());
    const updated = [query, ...filtered].slice(0, 10);
    this._recentSearches.set(updated);

    // Persist to storage (optional, could use localStorage)
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(EXPLORE_CACHE_KEYS.recentSearches, JSON.stringify(updated));
      }
    } catch {
      // Ignore storage errors
    }
  }

  /**
   * Load recent searches from storage.
   */
  loadRecentSearches(): void {
    try {
      if (typeof localStorage !== 'undefined') {
        const stored = localStorage.getItem(EXPLORE_CACHE_KEYS.recentSearches);
        if (stored) {
          this._recentSearches.set(JSON.parse(stored));
        }
      }
    } catch {
      // Ignore storage errors
    }
  }

  /**
   * Clear recent searches.
   */
  clearRecentSearches(): void {
    this._recentSearches.set([]);
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(EXPLORE_CACHE_KEYS.recentSearches);
      }
    } catch {
      // Ignore storage errors
    }
  }
}
