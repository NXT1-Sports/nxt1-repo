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
 * - Chronological feed (newest first)
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
 * }
 * ```
 */

import { Injectable, inject, signal, computed, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import {
  type FeedPost,
  type FeedItem,
  type FeedAuthor,
  type FeedPagination,
  FEED_PAGINATION_DEFAULTS,
} from '@nxt1/core';
import { APP_EVENTS, FIREBASE_EVENTS, type AnalyticsAdapter } from '@nxt1/core/analytics';
import { HapticsService } from '../services/haptics/haptics.service';
import { NxtToastService } from '../services/toast/toast.service';
import { NxtLoggingService } from '../services/logging/logging.service';
import { NxtBreadcrumbService } from '../services/breadcrumb/breadcrumb.service';
import { ANALYTICS_ADAPTER } from '../services/analytics/analytics-adapter.token';
import { FEED_API } from './feed-api.token';

/**
 * Feed state management service.
 * Provides reactive state for the feed interface.
 */
@Injectable({ providedIn: 'root' })
export class FeedService {
  private readonly api = inject(FEED_API, { optional: true });
  private readonly haptics = inject(HapticsService);
  private readonly toast = inject(NxtToastService);
  private readonly logger = inject(NxtLoggingService).child('FeedService');
  private readonly analytics = inject(ANALYTICS_ADAPTER, { optional: true });
  private readonly breadcrumb = inject(NxtBreadcrumbService);
  private readonly platformId = inject(PLATFORM_ID);

  // ============================================
  // PRIVATE WRITEABLE SIGNALS
  // ============================================

  private readonly _posts = signal<FeedPost[]>([]);
  private readonly _polymorphicFeed = signal<readonly FeedItem[]>([]);
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

  /** Polymorphic feed demonstration */
  readonly polymorphicFeed = computed(() => this._polymorphicFeed());

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
   * Load feed (chronological, newest first).
   * Replaces current posts.
   */
  async loadFeed(): Promise<void> {
    this.logger.info('Loading feed');
    this.breadcrumb.trackStateChange('feed:loading', {});

    this._isLoading.set(true);
    this._error.set(null);
    this._hasNewPosts.set(false);
    this._newPostsCount.set(0);

    try {
      if (!this.api) {
        this.logger.warn('FEED_API not provided — no feed data available');
        this._posts.set([]);
        this._polymorphicFeed.set([]);
        this._pagination.set(null);
        return;
      }

      const response = await this.api.getFeed(
        {},
        FEED_PAGINATION_DEFAULTS.INITIAL_PAGE,
        FEED_PAGINATION_DEFAULTS.LIMIT
      );

      if (response.success) {
        this._posts.set([...(response.data ?? [])]);
        this._pagination.set(response.pagination);
        // Polymorphic feed (FeedItem[]) requires a dedicated endpoint — clear for now
        this._polymorphicFeed.set([]);
        this.logger.info('Feed loaded', {
          count: response.data?.length ?? 0,
          hasMore: response.pagination?.hasMore,
        });
        this.breadcrumb.trackStateChange('feed:loaded', {
          count: response.data?.length ?? 0,
        });
        this.analytics?.trackEvent(APP_EVENTS.HOME_FEED_VIEWED, {
          count: response.data?.length ?? 0,
        });
      } else {
        this._error.set(response.error ?? 'Failed to load feed');
        this.logger.warn('Feed API returned error', { error: response.error });
        this.breadcrumb.trackStateChange('feed:error', { error: response.error });
        this.analytics?.trackEvent(APP_EVENTS.HOME_FEED_ERROR, { error: response.error });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load feed';
      this._error.set(message);
      this.logger.error('Failed to load feed', err);
      this.breadcrumb.trackStateChange('feed:error', { error: message });
      this.analytics?.trackEvent(APP_EVENTS.HOME_FEED_ERROR, { error: message });
    } finally {
      this._isLoading.set(false);
    }
  }

  /**
   * Load more posts (infinite scroll).
   */
  async loadMore(): Promise<void> {
    const pagination = this._pagination();
    if (!pagination?.hasMore || this._isLoadingMore() || !this.api) {
      return;
    }

    this.logger.info('Loading more posts', { currentPage: pagination.page });

    this._isLoadingMore.set(true);

    try {
      const nextPage = pagination.page + 1;

      const response = await this.api.getFeed({}, nextPage, FEED_PAGINATION_DEFAULTS.LIMIT);

      if (response.success) {
        this._posts.update((current) => [...current, ...(response.data ?? [])]);
        this._pagination.set(response.pagination);
        this.logger.info('More posts loaded', {
          count: response.data?.length ?? 0,
          page: nextPage,
        });
        this.analytics?.trackEvent(APP_EVENTS.HOME_FEED_LOAD_MORE, {
          page: nextPage,
          count: response.data?.length ?? 0,
        });
      } else {
        this.toast.error('Failed to load more posts');
        this.logger.warn('Load more API returned error', { error: response.error });
      }
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
      if (!this.api) {
        this.logger.warn('FEED_API not provided — cannot refresh');
        return;
      }

      const response = await this.api.getFeed(
        {},
        FEED_PAGINATION_DEFAULTS.INITIAL_PAGE,
        FEED_PAGINATION_DEFAULTS.LIMIT
      );

      if (response.success) {
        this._posts.set([...(response.data ?? [])]);
        this._pagination.set(response.pagination);
        this._polymorphicFeed.set([]);
        this._hasNewPosts.set(false);
        this._newPostsCount.set(0);
        this._error.set(null);

        await this.haptics.notification('success');
        this.logger.info('Feed refreshed', { count: response.data?.length ?? 0 });
        this.breadcrumb.trackStateChange('feed:refreshed', { count: response.data?.length ?? 0 });
        this.analytics?.trackEvent(APP_EVENTS.HOME_FEED_REFRESHED, {
          count: response.data?.length ?? 0,
        });
      } else {
        this.toast.error(response.error ?? 'Failed to refresh feed');
        this.logger.warn('Refresh API returned error', { error: response.error });
      }
    } catch (err) {
      this.toast.error('Failed to refresh feed');
      this.logger.error('Failed to refresh', err);
    } finally {
      this._isRefreshing.set(false);
    }
  }

  // ============================================
  // ENGAGEMENT ACTIONS
  // ============================================

  /**
   * Toggle like on a post (optimistic update).
   */
  async toggleLike(post: FeedPost): Promise<void> {
    const wasLiked = post.userEngagement.isLiked;
    const previous = this._posts();

    // Optimistic update
    this._posts.update((posts) =>
      posts.map((p) =>
        p.id === post.id
          ? {
              ...p,
              engagement: {
                ...p.engagement,
                likeCount: p.engagement.likeCount + (wasLiked ? -1 : 1),
              },
              userEngagement: {
                ...p.userEngagement,
                isLiked: !wasLiked,
              },
            }
          : p
      )
    );

    await this.haptics.impact(wasLiked ? 'light' : 'medium');

    try {
      if (this.api) {
        const response = await this.api.toggleLike(post.id);
        if (!response.success) {
          this._posts.set(previous); // Rollback
          this.toast.error('Failed to update like');
          this.logger.warn('toggleLike API returned error', {
            postId: post.id,
            error: response.error,
          });
          return;
        }
      }

      this.logger.info('Like toggled', { postId: post.id, liked: !wasLiked });
      this.analytics?.trackEvent(APP_EVENTS.HOME_FEED_POST_LIKED, {
        postId: post.id,
        liked: !wasLiked,
      });
    } catch (err) {
      // Rollback on error
      this._posts.set(previous);
      this.toast.error('Failed to update like');
      this.logger.error('Failed to toggle like', err, { postId: post.id });
    }
  }

  /**
   * Share a post.
   */
  async sharePost(post: FeedPost): Promise<void> {
    await this.haptics.impact('medium');

    // Use Web Share API if available (SSR-safe platform check)
    if (isPlatformBrowser(this.platformId) && navigator.share) {
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
    } else if (isPlatformBrowser(this.platformId)) {
      // Fallback: copy link
      const shareUrl = `https://nxt1sports.com/post/${post.id}`;
      try {
        if (navigator.clipboard?.writeText) {
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
}
