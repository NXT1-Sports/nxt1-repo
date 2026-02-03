/**
 * @fileoverview News Service - Shared State Management
 * @module @nxt1/ui/news
 * @version 1.0.0
 *
 * Signal-based state management for Sports News feature.
 * Shared between web and mobile applications.
 *
 * Features:
 * - Reactive state with Angular signals
 * - Category-based feed management
 * - Badge counts tracking
 * - Infinite scroll pagination
 * - Bookmark functionality
 * - Reading progress tracking with XP
 * - Pull-to-refresh support
 *
 * @example
 * ```typescript
 * @Component({...})
 * export class NewsPageComponent {
 *   private readonly news = inject(NewsService);
 *
 *   readonly articles = this.news.articles;
 *   readonly isLoading = this.news.isLoading;
 *   readonly activeCategory = this.news.activeCategory;
 *
 *   async onCategoryChange(categoryId: NewsCategoryId): Promise<void> {
 *     await this.news.loadFeed(categoryId);
 *   }
 * }
 * ```
 */

import { Injectable, inject, signal, computed } from '@angular/core';
import {
  type NewsArticle,
  type NewsCategoryId,
  type NewsPagination,
  type NewsFilter,
  type ReadingStats,
  NEWS_DEFAULT_CATEGORY,
  NEWS_CATEGORIES,
  NEWS_PAGINATION_DEFAULTS,
  NEWS_XP_REWARDS,
} from '@nxt1/core';
import { HapticsService } from '../services/haptics/haptics.service';
import { NxtToastService } from '../services/toast/toast.service';
import { NxtLoggingService } from '../services/logging/logging.service';
// ⚠️ TEMPORARY: Mock data for development (remove when backend is ready)
import {
  getMockArticlesByCategory,
  getMockRelatedArticles,
  MOCK_NEWS_BADGE_COUNTS,
  MOCK_READING_STATS,
} from './news.mock-data';

/**
 * News state management service.
 * Provides reactive state for the news interface.
 */
@Injectable({ providedIn: 'root' })
export class NewsService {
  // ⚠️ TEMPORARY: API service commented out - using mock data
  // private readonly api = inject(NewsApiService);
  private readonly haptics = inject(HapticsService);
  private readonly toast = inject(NxtToastService);
  private readonly logger = inject(NxtLoggingService).child('NewsService');

  // ============================================
  // PRIVATE WRITEABLE SIGNALS
  // ============================================

  private readonly _articles = signal<NewsArticle[]>([]);
  private readonly _activeCategory = signal<NewsCategoryId>(NEWS_DEFAULT_CATEGORY);
  private readonly _filters = signal<NewsFilter>({});
  // ⚠️ TEMPORARY: Using mock badge counts
  private readonly _badges = signal<Record<NewsCategoryId, number>>(MOCK_NEWS_BADGE_COUNTS);
  private readonly _isLoading = signal(false);
  private readonly _isLoadingMore = signal(false);
  private readonly _isRefreshing = signal(false);
  private readonly _error = signal<string | null>(null);
  private readonly _pagination = signal<NewsPagination | null>(null);
  private readonly _selectedArticle = signal<NewsArticle | null>(null);
  private readonly _readingProgress = signal<number>(0);
  private readonly _readingStats = signal<ReadingStats | null>(MOCK_READING_STATS);

  // ============================================
  // PUBLIC READONLY COMPUTED SIGNALS
  // ============================================

  /** Current articles in feed */
  readonly articles = computed(() => this._articles());

  /** Currently active category */
  readonly activeCategory = computed(() => this._activeCategory());

  /** Current filters applied */
  readonly filters = computed(() => this._filters());

  /** Badge counts per category */
  readonly badges = computed(() => this._badges());

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
  readonly isEmpty = computed(() => this._articles().length === 0 && !this._isLoading());

  /** Whether there are more items to load */
  readonly hasMore = computed(() => this._pagination()?.hasMore ?? false);

  /** Currently selected article for detail view */
  readonly selectedArticle = computed(() => this._selectedArticle());

  /** Current reading progress (0-100) */
  readonly readingProgress = computed(() => this._readingProgress());

  /** User's reading statistics */
  readonly readingStats = computed(() => this._readingStats());

  /** Total unread count across all categories */
  readonly totalUnread = computed(() => {
    const badges = this._badges();
    return Object.values(badges).reduce((sum, count) => sum + count, 0);
  });

  /** Badge count for current category */
  readonly currentCategoryBadge = computed(() => {
    const category = this._activeCategory();
    return this._badges()[category] ?? 0;
  });

  /** Categories with badge counts merged */
  readonly categoriesWithBadges = computed(() => {
    const badges = this._badges();
    return NEWS_CATEGORIES.map((cat) => ({
      ...cat,
      badge: badges[cat.id] ?? 0,
    }));
  });

  /** Bookmarked articles */
  readonly bookmarkedArticles = computed(() => {
    return this._articles().filter((article) => article.isBookmarked);
  });

  /** Unread articles in current category */
  readonly unreadArticles = computed(() => {
    return this._articles().filter((article) => !article.isRead);
  });

  /** Featured articles */
  readonly featuredArticles = computed(() => {
    return this._articles().filter((article) => article.isFeatured);
  });

  /** Total XP earned from reading */
  readonly totalXp = computed(() => {
    const stats = this._readingStats();
    return stats?.totalXpEarned ?? 0;
  });

  // ============================================
  // PUBLIC METHODS
  // ============================================

  /**
   * Set the active category and reload feed.
   *
   * @param category - Category ID to set
   */
  async setCategory(category: NewsCategoryId): Promise<void> {
    if (category === this._activeCategory()) return;
    await this.loadFeed(category);
  }

  /**
   * Load news feed for a category.
   * Resets articles and loads fresh data.
   *
   * @param category - Category ID to load (defaults to current active category)
   */
  async loadFeed(category: NewsCategoryId = this._activeCategory()): Promise<void> {
    this.logger.debug('Loading news feed', { category });
    this._activeCategory.set(category);
    this._isLoading.set(true);
    this._error.set(null);
    this._articles.set([]);

    try {
      // ⚠️ TEMPORARY: Using mock data
      // const response = await this.api.getFeed({ categories: [category], limit: NEWS_PAGINATION_DEFAULTS.LIMIT });
      await this.simulateNetworkDelay();
      const articles = getMockArticlesByCategory(category);

      this._articles.set(articles);
      this._pagination.set({
        page: 1,
        limit: NEWS_PAGINATION_DEFAULTS.LIMIT,
        total: articles.length,
        totalPages: Math.ceil(articles.length / NEWS_PAGINATION_DEFAULTS.LIMIT),
        hasMore: articles.length > NEWS_PAGINATION_DEFAULTS.LIMIT,
      });

      this.logger.debug('Feed loaded successfully', { count: articles.length });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load news';
      this._error.set(message);
      this.logger.error('Failed to load feed', { error: message });
    } finally {
      this._isLoading.set(false);
    }
  }

  /**
   * Load more articles (infinite scroll).
   */
  async loadMore(): Promise<void> {
    const pagination = this._pagination();
    if (!pagination?.hasMore || this._isLoadingMore()) return;

    this.logger.debug('Loading more articles');
    this._isLoadingMore.set(true);

    try {
      // ⚠️ TEMPORARY: Simulating load more with delay
      await this.simulateNetworkDelay(500);
      // In real implementation:
      // const response = await this.api.getFeed({ page: pagination.page + 1 });
      // this._articles.update(current => [...current, ...response.data]);

      this._pagination.update((p) =>
        p
          ? {
              ...p,
              page: p.page + 1,
              hasMore: false, // Mock: no more pages
            }
          : null
      );

      await this.haptics.impact('light');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load more';
      this.toast.error(message);
      this.logger.error('Failed to load more', { error: message });
    } finally {
      this._isLoadingMore.set(false);
    }
  }

  /**
   * Refresh feed (pull-to-refresh).
   */
  async refresh(): Promise<void> {
    this.logger.debug('Refreshing feed');
    this._isRefreshing.set(true);

    try {
      await this.loadFeed(this._activeCategory());
      await this.haptics.notification('success');
      this.toast.success('Feed updated');
    } catch {
      await this.haptics.notification('error');
    } finally {
      this._isRefreshing.set(false);
    }
  }

  /**
   * Select an article for detail view.
   *
   * @param article - Article to view, or null to clear selection
   */
  async selectArticle(article: NewsArticle | null): Promise<void> {
    if (!article) {
      this._selectedArticle.set(null);
      this._readingProgress.set(0);
      return;
    }

    this.logger.debug('Selecting article', { articleId: article.id });
    this._readingProgress.set(0);

    this._selectedArticle.set(article);

    // Award XP for opening article
    this.awardXp('article-open', NEWS_XP_REWARDS['article-open']);

    // Mark as read in the list
    this._articles.update((articles) =>
      articles.map((a) => (a.id === article.id ? { ...a, isRead: true } : a))
    );

    await this.haptics.impact('light');
  }

  /**
   * Clear selected article (close detail view).
   * Synchronous version - use when no async operations needed.
   */
  clearSelectedArticle(): void {
    this._selectedArticle.set(null);
    this._readingProgress.set(0);
  }

  /**
   * Update reading progress.
   *
   * @param progress - Progress percentage (0-100)
   */
  updateReadingProgress(progress: number): void {
    const previousProgress = this._readingProgress();
    this._readingProgress.set(progress);

    // Award XP for milestones
    if (previousProgress < 50 && progress >= 50) {
      this.awardXp('article-half', NEWS_XP_REWARDS['article-half']);
    }
    if (previousProgress < 100 && progress >= 100) {
      this.awardXp('article-complete', NEWS_XP_REWARDS['article-complete']);
    }
  }

  /**
   * Toggle bookmark status for an article.
   *
   * @param articleId - Article to bookmark/unbookmark
   */
  async toggleBookmark(articleId: string): Promise<void> {
    this.logger.debug('Toggling bookmark', { articleId });

    // Optimistic update
    const previous = this._articles();
    this._articles.update((articles) =>
      articles.map((a) => (a.id === articleId ? { ...a, isBookmarked: !a.isBookmarked } : a))
    );

    // Also update selected article if it's the same
    const selected = this._selectedArticle();
    if (selected?.id === articleId) {
      this._selectedArticle.set({ ...selected, isBookmarked: !selected.isBookmarked });
    }

    try {
      // ⚠️ TEMPORARY: Simulating API call
      // await this.api.toggleBookmark(articleId);
      await this.simulateNetworkDelay(200);

      const article = this._articles().find((a) => a.id === articleId);
      if (article?.isBookmarked) {
        await this.haptics.notification('success');
        this.toast.success('Article saved');
      } else {
        await this.haptics.impact('light');
        this.toast.info('Removed from saved');
      }
    } catch (err) {
      // Rollback on error
      this._articles.set(previous);
      if (selected?.id === articleId) {
        this._selectedArticle.set(selected);
      }
      this.toast.error('Failed to update bookmark');
      this.logger.error('Bookmark toggle failed', { articleId, error: err });
    }
  }

  /**
   * Share an article.
   *
   * @param article - Article to share
   */
  async shareArticle(article: NewsArticle): Promise<void> {
    this.logger.debug('Sharing article', { articleId: article.id });

    try {
      // Native share API (handled by platform-specific code)
      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share({
          title: article.title,
          text: article.excerpt,
          url: `https://nxt1.com/news/${article.slug || article.id}`,
        });

        // Award XP for sharing
        this.awardXp('article-share', NEWS_XP_REWARDS['article-share']);
        await this.haptics.notification('success');
      }
    } catch (err) {
      // User cancelled or share failed - not an error
      this.logger.debug('Share cancelled or failed', { error: err });
    }
  }

  /**
   * Get related articles for current article.
   */
  getRelatedArticles(articleId: string): NewsArticle[] {
    return getMockRelatedArticles(articleId, 3);
  }

  /**
   * Apply filters to the feed.
   *
   * @param filters - Filters to apply
   */
  async applyFilters(filters: NewsFilter): Promise<void> {
    this.logger.debug('Applying filters', { filters });
    this._filters.set(filters);
    await this.loadFeed(this._activeCategory());
  }

  /**
   * Clear all filters.
   */
  async clearFilters(): Promise<void> {
    this._filters.set({});
    await this.loadFeed(this._activeCategory());
  }

  // ============================================
  // PRIVATE METHODS
  // ============================================

  /**
   * Award XP and show toast.
   */
  private awardXp(type: string, amount: number): void {
    this.toast.success(`+${amount} XP earned!`, { duration: 2000 });
    this.logger.debug('XP awarded', { type, amount });

    // Update reading stats
    this._readingStats.update((stats) =>
      stats
        ? {
            ...stats,
            totalXpEarned: stats.totalXpEarned + amount,
          }
        : null
    );
  }

  /**
   * Simulate network delay for mock data.
   */
  private async simulateNetworkDelay(ms: number = 800): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
