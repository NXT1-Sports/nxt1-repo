/**
 * @fileoverview Help Center Service - State Management (Shared)
 * @module @nxt1/ui/help-center/_shared
 * @version 4.0.0
 *
 * Signal-based state management for Help Center feature.
 * Platform-agnostic - used by both web (Tailwind) and mobile (Ionic) components.
 *
 * When HELP_CENTER_API is provided, loads data from the backend.
 * Falls back to empty state if no adapter is injected.
 *
 * ⭐ 100% SHARED BETWEEN WEB AND MOBILE ⭐
 */

import { Injectable, InjectionToken, signal, computed, inject } from '@angular/core';
import type {
  HelpCategory,
  HelpArticle,
  FaqItem,
  HelpCategoryId,
  HelpUserType,
  HelpCenterApi,
  HelpCenterHome,
  HelpCategoryDetail,
  HelpPagination,
  HelpSearchResult,
} from '@nxt1/core';
import { HELP_CATEGORIES, HELP_QUICK_ACTIONS } from '@nxt1/core';
import { NxtLoggingService } from '../../services/logging';
import { ANALYTICS_ADAPTER } from '../../services/analytics/analytics-adapter.token';
import { NxtBreadcrumbService } from '../../services/breadcrumb';
import { APP_EVENTS } from '@nxt1/core/analytics';

// ============================================
// INJECTION TOKEN
// ============================================

/**
 * Injection token for the Help Center API adapter.
 * Provide a platform-specific implementation in the app's providers.
 *
 * @example (web app, help-center.routes.ts)
 * ```typescript
 * import { HELP_CENTER_API } from '@nxt1/ui/help-center';
 * import { HelpCenterApiService } from './services/help-center-api.service';
 *
 * providers: [{ provide: HELP_CENTER_API, useExisting: HelpCenterApiService }]
 * ```
 */
export const HELP_CENTER_API = new InjectionToken<HelpCenterApi>('HELP_CENTER_API');

@Injectable({ providedIn: 'root' })
export class HelpCenterService {
  private readonly api = inject(HELP_CENTER_API, { optional: true });
  private readonly logger = inject(NxtLoggingService).child('HelpCenterService');
  private readonly analytics = inject(ANALYTICS_ADAPTER, { optional: true });
  private readonly breadcrumb = inject(NxtBreadcrumbService);

  // ============================================
  // Private Signals (Never expose directly)
  // ============================================
  private readonly _loading = signal(false);
  private readonly _searchQuery = signal('');
  private readonly _selectedCategory = signal<HelpCategoryId | null>(null);
  private readonly _articles = signal<HelpArticle[]>([]);
  private readonly _faqs = signal<FaqItem[]>([]);
  private readonly _userRole = signal<HelpUserType | null>(null);
  private readonly _error = signal<string | null>(null);
  private readonly _homeData = signal<HelpCenterHome | null>(null);
  private readonly _categoryDetail = signal<HelpCategoryDetail | null>(null);
  private readonly _selectedArticle = signal<HelpArticle | null>(null);
  private readonly _pagination = signal<HelpPagination | null>(null);
  private readonly _searchResults = signal<HelpSearchResult[]>([]);

  // ============================================
  // Public Computed Signals
  // ============================================
  readonly loading = computed(() => this._loading());
  readonly searchQuery = computed(() => this._searchQuery());
  readonly selectedCategory = computed(() => this._selectedCategory());
  readonly userRole = computed(() => this._userRole());
  readonly error = computed(() => this._error());
  readonly homeData = computed(() => this._homeData());
  readonly categoryDetail = computed(() => this._categoryDetail());
  readonly selectedArticle = computed(() => this._selectedArticle());
  readonly pagination = computed(() => this._pagination());
  readonly searchResults = computed(() => this._searchResults());

  /** Categories filtered by user role */
  readonly categories = computed<readonly HelpCategory[]>(() => {
    const role = this._userRole();
    return HELP_CATEGORIES.filter((c) => this.matchesRole(c.targetUsers, role));
  });

  /** Featured articles filtered by user role (top 3) */
  readonly featuredArticles = computed(() =>
    this._articles()
      .filter((a) => a.isFeatured && this.matchesRole(a.targetUsers, this._userRole()))
      .slice(0, 3)
  );

  /** All articles filtered by user role */
  readonly articles = computed(() =>
    this._articles().filter((a) => this.matchesRole(a.targetUsers, this._userRole()))
  );

  /** All FAQs filtered by user role */
  readonly faqs = computed(() =>
    this._faqs().filter((f) => this.matchesRole(f.targetUsers, this._userRole()))
  );

  /** Quick actions filtered by user role */
  readonly quickActions = computed(() => {
    const role = this._userRole();
    return HELP_QUICK_ACTIONS.filter((a) => this.matchesRole(a.targetUsers, role));
  });

  /** Filtered articles based on search, category, and user role */
  readonly filteredArticles = computed(() => {
    const query = this._searchQuery().toLowerCase().trim();
    const category = this._selectedCategory();
    const role = this._userRole();
    let results = this._articles().filter((a) => this.matchesRole(a.targetUsers, role));

    if (category) {
      results = results.filter((a) => a.category === category);
    }

    if (query) {
      results = results.filter(
        (a) =>
          a.title.toLowerCase().includes(query) ||
          a.excerpt.toLowerCase().includes(query) ||
          a.tags.some((t) => t.toLowerCase().includes(query))
      );
    }

    return results;
  });

  /** Filtered FAQs based on search, category, and user role */
  readonly filteredFaqs = computed(() => {
    const query = this._searchQuery().toLowerCase().trim();
    const category = this._selectedCategory();
    const role = this._userRole();
    let results = this._faqs().filter((f) => this.matchesRole(f.targetUsers, role));

    if (category) {
      results = results.filter((f) => f.category === category);
    }

    if (query) {
      results = results.filter(
        (f) => f.question.toLowerCase().includes(query) || f.answer.toLowerCase().includes(query)
      );
    }

    return results;
  });

  /** Popular FAQs filtered by user role (sorted by helpful count) */
  readonly popularFaqs = computed(() =>
    [...this._faqs()]
      .filter((f) => this.matchesRole(f.targetUsers, this._userRole()))
      .sort((a, b) => b.helpfulCount - a.helpfulCount)
      .slice(0, 5)
  );

  /** Whether there are search results */
  readonly hasResults = computed(
    () => this.filteredArticles().length > 0 || this.filteredFaqs().length > 0
  );

  /** Whether search is active */
  readonly isSearching = computed(() => this._searchQuery().trim().length > 0);

  // ============================================
  // Async API Methods (use adapter when available)
  // ============================================

  /**
   * Load help center home page data from the API.
   * Populates articles, FAQs, and home data signals.
   */
  async loadHome(): Promise<void> {
    if (!this.api) return;

    this._loading.set(true);
    this._error.set(null);
    this.logger.info('Loading help center home');
    this.breadcrumb.trackStateChange('help-center:loading');

    try {
      const response = await this.api.getHome(this._userRole() ?? undefined);
      if (response.data) {
        this._homeData.set(response.data);
        this._articles.set(response.data.popularArticles ?? []);
        this._faqs.set(response.data.topFaqs ?? []);
        this.logger.info('Help center home loaded', {
          articles: response.data.popularArticles?.length ?? 0,
          faqs: response.data.topFaqs?.length ?? 0,
        });
        this.analytics?.trackEvent(APP_EVENTS.HELP_CENTER_VIEWED);
        this.breadcrumb.trackStateChange('help-center:loaded');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load help center';
      this.logger.error('Failed to load help center home', err);
      this._error.set(message);
      this.breadcrumb.trackStateChange('help-center:error');
    } finally {
      this._loading.set(false);
    }
  }

  /**
   * Load category detail from the API.
   * Populates articles, FAQs, and category detail signals.
   */
  async loadCategory(categoryId: HelpCategoryId, page = 1, limit = 12): Promise<void> {
    if (!this.api) return;

    this._loading.set(true);
    this._error.set(null);
    this._selectedCategory.set(categoryId);
    this.logger.info('Loading category', { categoryId, page });
    this.breadcrumb.trackStateChange('help-center:category-loading', { categoryId });

    try {
      const response = await this.api.getCategory(categoryId, page, limit);
      if (response.data) {
        this._categoryDetail.set(response.data);
        this._articles.set(response.data.articles ?? []);
        this._faqs.set(response.data.faqs ?? []);
        this._pagination.set(response.data.pagination ?? null);
        this.logger.info('Category loaded', {
          categoryId,
          articles: response.data.articles?.length ?? 0,
        });
        this.analytics?.trackEvent(APP_EVENTS.HELP_CENTER_CATEGORY_VIEWED, {
          category_id: categoryId,
          article_count: response.data.articles?.length ?? 0,
        });
        this.breadcrumb.trackStateChange('help-center:category-loaded', { categoryId });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load category';
      this.logger.error('Failed to load category', err, { categoryId });
      this._error.set(message);
      this.breadcrumb.trackStateChange('help-center:error', { categoryId });
    } finally {
      this._loading.set(false);
    }
  }

  /**
   * Load a single article from the API.
   */
  async loadArticle(slug: string): Promise<void> {
    if (!this.api) return;

    this._loading.set(true);
    this._error.set(null);
    this.logger.info('Loading article', { slug });
    this.breadcrumb.trackStateChange('help-center:article-loading', { slug });

    try {
      const response = await this.api.getArticle(slug);
      if (response.data) {
        this._selectedArticle.set(response.data);
        // Also add to _articles so getArticleBySlug() and computed signals work
        this._articles.update((existing) => {
          const filtered = existing.filter((a) => a.id !== response.data!.id);
          return [response.data!, ...filtered];
        });
        this.logger.info('Article loaded', { slug, title: response.data.title });
        this.analytics?.trackEvent(APP_EVENTS.HELP_CENTER_ARTICLE_VIEWED, {
          article_slug: slug,
          article_title: response.data.title,
          help_category: response.data.category,
        });
        this.breadcrumb.trackStateChange('help-center:article-loaded', { slug });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load article';
      this.logger.error('Failed to load article', err, { slug });
      this._error.set(message);
      this.breadcrumb.trackStateChange('help-center:error', { slug });
    } finally {
      this._loading.set(false);
    }
  }

  /**
   * Search help center content via API.
   */
  async searchArticles(query: string): Promise<void> {
    if (!this.api || !query.trim()) return;

    this._loading.set(true);
    this._error.set(null);
    this._searchQuery.set(query);
    this.logger.info('Searching help center', { query });
    this.breadcrumb.trackStateChange('help-center:searching', { query });

    try {
      const response = await this.api.search({ query, userType: this._userRole() ?? undefined });
      if (response.data) {
        this._searchResults.set(response.data.results ?? []);
        this.logger.info('Search complete', {
          query,
          results: response.data.results?.length ?? 0,
          total: response.data.total,
        });
        this.analytics?.trackEvent(APP_EVENTS.HELP_CENTER_SEARCHED, {
          search_query: query,
          result_count: response.data.results?.length ?? 0,
        });
        this.breadcrumb.trackStateChange('help-center:search-complete', { query });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Search failed';
      this.logger.error('Help center search failed', err, { query });
      this._error.set(message);
      this.breadcrumb.trackStateChange('help-center:error', { query });
    } finally {
      this._loading.set(false);
    }
  }

  /**
   * Submit article feedback (helpful / not helpful).
   */
  async submitArticleFeedback(
    articleId: string,
    isHelpful: boolean,
    feedback?: string
  ): Promise<boolean> {
    if (!this.api) return false;

    this.logger.info('Submitting feedback', { articleId, isHelpful });

    try {
      await this.api.submitFeedback({ articleId, isHelpful, feedback });
      this.logger.info('Feedback submitted', { articleId, isHelpful });
      this.analytics?.trackEvent(APP_EVENTS.HELP_CENTER_FEEDBACK_SUBMITTED, {
        article_id: articleId,
        is_helpful: String(isHelpful),
      });
      return true;
    } catch (err) {
      this.logger.error('Failed to submit feedback', err, { articleId });
      return false;
    }
  }

  // ============================================
  // Sync Actions (local state management)
  // ============================================

  /**
   * Set the current user role for content filtering.
   * Pass null to show all content (unauthenticated users).
   */
  setUserRole(role: HelpUserType | null): void {
    this._userRole.set(role);
  }

  setSearchQuery(query: string): void {
    this._searchQuery.set(query);
  }

  setCategory(categoryId: HelpCategoryId | null): void {
    this._selectedCategory.set(categoryId);
  }

  clearSearch(): void {
    this._searchQuery.set('');
    this._searchResults.set([]);
  }

  clearFilters(): void {
    this._searchQuery.set('');
    this._selectedCategory.set(null);
    this._searchResults.set([]);
  }

  getArticleById(id: string): HelpArticle | undefined {
    return this._articles().find((a) => a.id === id);
  }

  getArticleBySlug(slug: string): HelpArticle | undefined {
    return this._articles().find((a) => a.slug === slug);
  }

  getCategoryById(id: HelpCategoryId): HelpCategory | undefined {
    return HELP_CATEGORIES.find((c) => c.id === id);
  }

  getArticlesByCategory(categoryId: HelpCategoryId): HelpArticle[] {
    const role = this._userRole();
    return this._articles().filter(
      (a) => a.category === categoryId && this.matchesRole(a.targetUsers, role)
    );
  }

  getFaqsByCategory(categoryId: HelpCategoryId): FaqItem[] {
    const role = this._userRole();
    return this._faqs().filter(
      (f) => f.category === categoryId && this.matchesRole(f.targetUsers, role)
    );
  }

  // ============================================
  // Private Helpers
  // ============================================

  /**
   * Checks if content should be visible to the given user role.
   * Content with 'all' in targetUsers is always visible.
   * If no role is set (null), all content is shown.
   */
  private matchesRole(
    targetUsers: readonly HelpUserType[] | undefined,
    role: HelpUserType | null
  ): boolean {
    if (!targetUsers || targetUsers.length === 0 || targetUsers.includes('all')) return true;
    if (!role) return true;
    return targetUsers.includes(role);
  }
}
