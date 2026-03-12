/**
 * @fileoverview Feed Service - Shared State Management
 * @module @nxt1/ui/feed
 * @version 1.0.0
 *
 * Signal-based state management for Home Feed feature.
 * Shared between web and mobile applications.
 *
 * Features:
 * - Reactive state with Angular signals
 * - Filter-based feed management
 * - Infinite scroll pagination
 * - Optimistic UI for engagement actions
 * - Pull-to-refresh support
 *
 * @example
 * ```typescript
 * @Component({...})
 * export class HomePageComponent {
 *   private readonly feed = inject(FeedService);
 *
 *   readonly posts = this.feed.posts;
 *   readonly isLoading = this.feed.isLoading;
 *   readonly activeFilter = this.feed.activeFilter;
 *
 *   async onFilterChange(filter: FeedFilterType): Promise<void> {
 *     await this.feed.loadFeed(filter);
 *   }
 * }
 * ```
 */

import { Injectable, inject, signal, computed } from '@angular/core';
import {
  type FeedPost,
  type FeedAuthor,
  type FeedFilterType,
  type FeedFilter,
  type FeedPagination,
  FEED_DEFAULT_FILTER,
  FEED_PAGINATION_DEFAULTS,
} from '@nxt1/core';
import { FIREBASE_EVENTS, type AnalyticsAdapter } from '@nxt1/core/analytics';
import { HapticsService } from '../services/haptics/haptics.service';
import { NxtToastService } from '../services/toast/toast.service';
import { NxtLoggingService } from '../services/logging/logging.service';
import { ANALYTICS_ADAPTER } from '../services/analytics/analytics-adapter.token';
// ⚠️ TEMPORARY: Mock data for development (remove when backend is ready)
import { getMockFeedPosts, mockToggleLike, mockToggleBookmark } from './feed.mock-data';

/**
 * Feed state management service.
 * Provides reactive state for the feed interface.
 */
@Injectable({ providedIn: 'root' })
export class FeedService {
  // ⚠️ TEMPORARY: API service commented out - using mock data
  // private readonly api = inject(FeedApiService);
  private readonly haptics = inject(HapticsService);
  private readonly toast = inject(NxtToastService);
  private readonly logger = inject(NxtLoggingService).child('FeedService');
  private readonly analytics = inject(ANALYTICS_ADAPTER, { optional: true });

  // ============================================
  // PRIVATE WRITEABLE SIGNALS
  // ============================================

  private readonly _posts = signal<FeedPost[]>([]);
  private readonly _activeFilter = signal<FeedFilterType>(FEED_DEFAULT_FILTER);
  private readonly _filters = signal<FeedFilter>({});
  private readonly _isLoading = signal(false);
  private readonly _isLoadingMore = signal(false);
  private readonly _isRefreshing = signal(false);
  private readonly _error = signal<string | null>(null);
  private readonly _pagination = signal<FeedPagination | null>(null);
  private readonly _selectedPost = signal<FeedPost | null>(null);
  private readonly _hasNewPosts = signal(false);
  private readonly _newPostsCount = signal(0);

  // ============================================
  // PUBLIC READONLY COMPUTED SIGNALS
  // ============================================

  /** Current posts in feed */
  readonly posts = computed(() => this._posts());

  /** Currently active filter type */
  readonly activeFilter = computed(() => this._activeFilter());

  /** Current filters applied */
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
  readonly isEmpty = computed(() => this._posts().length === 0 && !this._isLoading());

  /** Whether there are more items to load */
  readonly hasMore = computed(() => this._pagination()?.hasMore ?? false);

  /** Currently selected post for detail view */
  readonly selectedPost = computed(() => this._selectedPost());

  /** Whether there are new posts available */
  readonly hasNewPosts = computed(() => this._hasNewPosts());

  /** Number of new posts available */
  readonly newPostsCount = computed(() => this._newPostsCount());

  /** Total post count */
  readonly totalPosts = computed(() => this._pagination()?.total ?? 0);

  // ============================================
  // FEED LOADING
  // ============================================

  /**
   * Load feed with specified filter.
   * Replaces current posts.
   */
  async loadFeed(filterType?: FeedFilterType): Promise<void> {
    const filter = filterType ?? this._activeFilter();

    this.logger.info('Loading feed', { filter });

    this._isLoading.set(true);
    this._error.set(null);
    this._activeFilter.set(filter);
    this._hasNewPosts.set(false);
    this._newPostsCount.set(0);

    try {
      // ⚠️ TEMPORARY: Using mock data
      // const response = await this.api.getFeed({ type: filter });
      const { posts, pagination } = getMockFeedPosts(1, FEED_PAGINATION_DEFAULTS.LIMIT, filter);

      // Simulate network delay for realistic UX
      await this.delay(800);

      this._posts.set(posts);
      this._pagination.set(pagination);

      this.logger.info('Feed loaded', { count: posts.length, hasMore: pagination.hasMore });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load feed';
      this._error.set(message);
      this.logger.error('Failed to load feed', err);
    } finally {
      this._isLoading.set(false);
    }
  }

  /**
   * Load more posts (infinite scroll).
   */
  async loadMore(): Promise<void> {
    const pagination = this._pagination();
    if (!pagination?.hasMore || this._isLoadingMore()) {
      return;
    }

    this.logger.info('Loading more posts', { currentPage: pagination.page });

    this._isLoadingMore.set(true);

    try {
      const nextPage = pagination.page + 1;

      // ⚠️ TEMPORARY: Using mock data
      // const response = await this.api.getFeed(
      //   { type: this._activeFilter() },
      //   nextPage
      // );
      const { posts, pagination: newPagination } = getMockFeedPosts(
        nextPage,
        FEED_PAGINATION_DEFAULTS.LIMIT,
        this._activeFilter()
      );

      // Simulate network delay
      await this.delay(500);

      this._posts.update((current) => [...current, ...posts]);
      this._pagination.set(newPagination);

      this.logger.info('More posts loaded', { count: posts.length, page: nextPage });
    } catch (err) {
      this.toast.error('Failed to load more posts');
      this.logger.error('Failed to load more', err);
    } finally {
      this._isLoadingMore.set(false);
    }
  }

  /**
   * Refresh feed (pull-to-refresh).
   */
  async refresh(): Promise<void> {
    this.logger.info('Refreshing feed');

    this._isRefreshing.set(true);
    await this.haptics.impact('light');

    try {
      // ⚠️ TEMPORARY: Using mock data
      const { posts, pagination } = getMockFeedPosts(
        1,
        FEED_PAGINATION_DEFAULTS.LIMIT,
        this._activeFilter()
      );

      // Simulate network delay
      await this.delay(600);

      this._posts.set(posts);
      this._pagination.set(pagination);
      this._hasNewPosts.set(false);
      this._newPostsCount.set(0);
      this._error.set(null);

      await this.haptics.notification('success');
      this.logger.info('Feed refreshed');
    } catch (err) {
      this.toast.error('Failed to refresh feed');
      this.logger.error('Failed to refresh', err);
    } finally {
      this._isRefreshing.set(false);
    }
  }

  /**
   * Change filter type.
   */
  async changeFilter(filterType: FeedFilterType): Promise<void> {
    if (filterType === this._activeFilter()) {
      return;
    }

    await this.haptics.impact('light');
    await this.loadFeed(filterType);
  }

  // ============================================
  // ENGAGEMENT ACTIONS
  // ============================================

  /**
   * Toggle like on a post (optimistic update).
   */
  async toggleLike(post: FeedPost): Promise<void> {
    const wasLiked = post.userEngagement.isLiked;

    // Optimistic update
    this._posts.update((posts) => posts.map((p) => (p.id === post.id ? mockToggleLike(p) : p)));

    await this.haptics.impact(wasLiked ? 'light' : 'medium');

    try {
      // ⚠️ TEMPORARY: Using mock - would call API
      // await this.api.toggleLike(post.id);

      this.logger.info('Like toggled', { postId: post.id, liked: !wasLiked });
    } catch (err) {
      // Rollback on error
      this._posts.update((posts) => posts.map((p) => (p.id === post.id ? post : p)));
      this.toast.error('Failed to update like');
      this.logger.error('Failed to toggle like', err);
    }
  }

  /**
   * Toggle bookmark on a post (optimistic update).
   */
  async toggleBookmark(post: FeedPost): Promise<void> {
    const wasBookmarked = post.userEngagement.isBookmarked;

    // Optimistic update
    this._posts.update((posts) => posts.map((p) => (p.id === post.id ? mockToggleBookmark(p) : p)));

    await this.haptics.impact('light');

    if (!wasBookmarked) {
      this.toast.success('Post saved');
    }

    try {
      // ⚠️ TEMPORARY: Using mock - would call API
      // await this.api.toggleBookmark(post.id);

      this.logger.info('Bookmark toggled', { postId: post.id, bookmarked: !wasBookmarked });
    } catch (err) {
      // Rollback on error
      this._posts.update((posts) => posts.map((p) => (p.id === post.id ? post : p)));
      this.toast.error('Failed to save post');
      this.logger.error('Failed to toggle bookmark', err);
    }
  }

  /**
   * Share a post.
   */
  async sharePost(post: FeedPost): Promise<void> {
    await this.haptics.impact('medium');

    // Use Web Share API if available
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: `${post.author.displayName} on NXT1`,
          text: post.content?.substring(0, 100) ?? 'Check out this post',
          url: `https://nxt1sports.com/post/${post.id}`,
        });

        this.logger.info('Post shared via native share', { postId: post.id });
        this.trackShareEvent(post, 'native_share');
      } catch (err) {
        // User cancelled or share failed
        this.logger.warn('Share cancelled or failed', { error: err });
      }
    } else {
      // Fallback: copy link
      const shareUrl = `https://nxt1sports.com/post/${post.id}`;
      try {
        if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(shareUrl);
        }
        this.toast.info('Link copied to clipboard');
        this.logger.info('Share fallback: copy link', { postId: post.id });
        this.trackShareEvent(post, 'copy_link');
      } catch (error) {
        this.toast.error('Failed to copy link');
        this.logger.warn('Share fallback copy failed', { error });
      }
    }
  }

  private trackShareEvent(post: FeedPost, method: string): void {
    const analytics: AnalyticsAdapter | null = this.analytics ?? null;
    if (!analytics) return;

    const payload = {
      method,
      content_type: 'post',
      item_id: post.id,
    };

    analytics.trackEvent(FIREBASE_EVENTS.SHARE, payload);
  }

  // ============================================
  // POST SELECTION
  // ============================================

  /**
   * Select a post for detail view.
   */
  selectPost(post: FeedPost): void {
    this._selectedPost.set(post);
    this.logger.info('Post selected', { postId: post.id });
  }

  /**
   * Clear selected post.
   */
  clearSelectedPost(): void {
    this._selectedPost.set(null);
  }

  // ============================================
  // NAVIGATION
  // ============================================

  /**
   * Navigate to author profile.
   */
  navigateToAuthor(author: FeedAuthor): void {
    this.logger.info('Navigate to author', { profileCode: author.profileCode });
    // Navigation handled by parent component
  }

  // ============================================
  // HELPERS
  // ============================================

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
