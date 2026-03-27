/**
 * @fileoverview News Service - Shared State Management
 * @module @nxt1/ui/news
 * @version 2.0.0
 *
 * Signal-based state management for Sports News (Pulse) feature.
 * Shared between web and mobile applications.
 *
 * Features:
 * - Reactive state with Angular signals
 * - Category-based feed management
 * - Infinite scroll pagination
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

import { Injectable, inject, signal, computed, InjectionToken, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import {
  type NewsArticle,
  type NewsCategoryId,
  type NewsPagination,
  type NewsFilter,
  NEWS_DEFAULT_CATEGORY,
  NEWS_CATEGORIES,
  NEWS_PAGINATION_DEFAULTS,
} from '@nxt1/core';
import { APP_EVENTS, FIREBASE_EVENTS } from '@nxt1/core/analytics';
import { HapticsService } from '../services/haptics/haptics.service';
import { NxtToastService } from '../services/toast/toast.service';
import { NxtLoggingService } from '../services/logging/logging.service';
import { NxtBreadcrumbService } from '../services/breadcrumb/breadcrumb.service';
import { ANALYTICS_ADAPTER } from '../services/analytics/analytics-adapter.token';

// ============================================
// NEWS API ADAPTER INJECTION TOKEN
// ============================================

/**
 * Interface that a platform-specific news API service must implement.
 * Web provides NewsApiService; mobile can provide its own adapter.
 */
export interface INewsApiAdapter {
  getFeed(
    category: NewsCategoryId,
    page: number,
    limit: number
  ): Promise<{ data: NewsArticle[]; pagination: NewsPagination }>;

  getArticle?(id: string): Promise<NewsArticle | null>;
}

/**
 * Injection token for the news API adapter.
 * Provide a platform-specific implementation in the app's providers.
 * When not provided, the service falls back to built-in mock data.
 *
 * @example (web app, news.routes.ts)
 * ```typescript
 * providers: [{ provide: NEWS_API_ADAPTER, useExisting: NewsApiService }]
 * ```
 */
export const NEWS_API_ADAPTER = new InjectionToken<INewsApiAdapter>('NEWS_API_ADAPTER');

/**
 * News state management service.
 * Provides reactive state for the news interface.
 */
@Injectable({ providedIn: 'root' })
export class NewsService {
  // Real API adapter — provided by the web/mobile app. Falls back to mock if absent.
  private readonly apiAdapter = inject(NEWS_API_ADAPTER, { optional: true });
  private readonly haptics = inject(HapticsService);
  private readonly toast = inject(NxtToastService);
  private readonly platformId = inject(PLATFORM_ID);

  // ✅ All four observability pillars
  private readonly logger = inject(NxtLoggingService).child('NewsService');
  private readonly analytics = inject(ANALYTICS_ADAPTER, { optional: true });
  private readonly breadcrumb = inject(NxtBreadcrumbService);

  // ============================================
  // PRIVATE WRITEABLE SIGNALS
  // ============================================

  private readonly _articles = signal<NewsArticle[]>([]);
  private readonly _activeCategory = signal<NewsCategoryId>(NEWS_DEFAULT_CATEGORY);
  private readonly _filters = signal<NewsFilter>({});
  private readonly _badges = signal<Record<NewsCategoryId, number>>(
    {} as Record<NewsCategoryId, number>
  );
  private readonly _isLoading = signal(false);
  private readonly _isLoadingMore = signal(false);
  private readonly _isRefreshing = signal(false);
  private readonly _error = signal<string | null>(null);
  private readonly _pagination = signal<NewsPagination | null>(null);
  private readonly _selectedArticle = signal<NewsArticle | null>(null);

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
    this.analytics?.trackEvent(APP_EVENTS.NEWS_CATEGORY_CHANGED, { news_category: category });
    await this.loadFeed(category);
  }

  /**
   * Load news feed for a category.
   * Resets articles and loads fresh data.
   *
   * @param category - Category ID to load (defaults to current active category)
   */
  async loadFeed(category: NewsCategoryId = this._activeCategory()): Promise<void> {
    this.logger.info('Loading news feed', { category });
    this.breadcrumb.trackStateChange('news:loading', { category });
    this._activeCategory.set(category);
    this._isLoading.set(true);
    this._error.set(null);
    this._articles.set([]);

    try {
      if (this.apiAdapter) {
        // Real API path
        const result = await this.apiAdapter.getFeed(category, 1, NEWS_PAGINATION_DEFAULTS.LIMIT);
        this._articles.set(result.data);
        this._pagination.set(result.pagination);
      } else {
        // No API adapter — show empty feed
        this._articles.set([]);
        this._pagination.set({
          page: 1,
          limit: NEWS_PAGINATION_DEFAULTS.LIMIT,
          total: 0,
          totalPages: 0,
          hasMore: false,
        });
      }

      this.logger.info('Feed loaded successfully', { category, count: this._articles().length });
      this.breadcrumb.trackStateChange('news:loaded', { category, count: this._articles().length });
      this.analytics?.trackEvent(APP_EVENTS.NEWS_FEED_VIEWED, {
        news_category: category,
        count: this._articles().length,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load news';
      this._error.set(message);
      this.logger.error('Failed to load feed', err, { category });
      this.breadcrumb.trackStateChange('news:error', { category });
      this.analytics?.trackEvent(APP_EVENTS.NEWS_ERROR_FEED_LOAD, {
        news_category: category,
        error: message,
      });
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

    this.logger.info('Loading more articles', { nextPage: pagination.page + 1 });
    this._isLoadingMore.set(true);

    try {
      if (this.apiAdapter) {
        const nextPage = pagination.page + 1;
        const result = await this.apiAdapter.getFeed(
          this._activeCategory(),
          nextPage,
          pagination.limit
        );
        this._articles.update((current) => [...current, ...result.data]);
        this._pagination.set(result.pagination);
      } else {
        // No API adapter — nothing to load
        this._pagination.update((p) => (p ? { ...p, hasMore: false } : null));
      }

      this.analytics?.trackEvent(APP_EVENTS.NEWS_LOAD_MORE, { page: pagination.page + 1 });
      await this.haptics.impact('light');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load more';
      this.toast.error(message);
      this.logger.error('Failed to load more', err, { page: pagination.page + 1 });
    } finally {
      this._isLoadingMore.set(false);
    }
  }

  /**
   * Refresh feed (pull-to-refresh).
   */
  async refresh(): Promise<void> {
    this.logger.info('Refreshing feed');
    this.analytics?.trackEvent(APP_EVENTS.NEWS_FEED_REFRESHED);
    this._isRefreshing.set(true);

    try {
      await this.loadFeed(this._activeCategory());
      await this.haptics.notification('success');
      this.toast.success('Feed updated');
    } catch (err) {
      this.logger.error('Failed to refresh feed', err);
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
      return;
    }

    this.logger.info('Selecting article', { articleId: article.id });
    this._selectedArticle.set(article);
    this.analytics?.trackEvent(APP_EVENTS.NEWS_ARTICLE_VIEWED, {
      articleId: article.id,
      sport: article.sport,
      source: article.source,
    });
    await this.haptics.impact('light');
  }

  /**
   * Clear selected article (close detail view).
   * Synchronous version - use when no async operations needed.
   */
  clearSelectedArticle(): void {
    this._selectedArticle.set(null);
  }

  /**
   * Load an article by its Firestore document ID.
   * Used when navigating directly to /news/:id.
   *
   * @param id - Firestore document ID
   */
  async loadArticleById(id: string): Promise<void> {
    this._isLoading.set(true);
    this._error.set(null);
    this.logger.info('Loading article by ID', { id });
    this.breadcrumb.trackStateChange('news:article-loading', { id });

    try {
      if (this.apiAdapter?.getArticle) {
        const article = await this.apiAdapter.getArticle(id);
        if (article) {
          this._selectedArticle.set(article);
          this.analytics?.trackEvent(APP_EVENTS.NEWS_ARTICLE_VIEWED, {
            articleId: article.id,
            sport: article.sport,
            source: article.source,
          });
          this.logger.info('Article loaded', { id, source: article.source });
          this.breadcrumb.trackStateChange('news:article-loaded', { id });
        } else {
          this._error.set('Article not found');
          this.logger.warn('Article not found', { id });
        }
      } else {
        this._error.set('Article loading not available');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load article';
      this._error.set(message);
      this.logger.error('Failed to load article by ID', err, { id });
    } finally {
      this._isLoading.set(false);
    }
  }

  /**
   * Share an article.
   *
   * @param article - Article to share
   */
  async shareArticle(article: NewsArticle): Promise<void> {
    this.logger.info('Sharing article', { articleId: article.id });

    try {
      if (isPlatformBrowser(this.platformId) && navigator.share) {
        await navigator.share({
          title: article.title,
          text: article.excerpt,
          url: `https://nxt1.com/news/${article.slug || article.id}`,
        });

        this.analytics?.trackEvent(FIREBASE_EVENTS.SHARE, {
          method: 'native',
          content_type: 'news_article',
          item_id: article.id,
        });
        await this.haptics.notification('success');
      }
    } catch (err) {
      // User cancelled or share failed - not an error
      this.logger.debug('Share cancelled or failed', { error: err });
    }
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
}
