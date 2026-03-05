/**
 * @fileoverview Activity Service - Mobile App State Management
 * @module @nxt1/mobile/features/activity
 * @version 1.0.0
 *
 * Signal-based state management for Activity/Notifications feature.
 * Platform-specific implementation for mobile application.
 *
 * Mobile-specific features:
 * - Native haptics integration
 * - Capacitor HTTP for native networking
 * - Offline support via MobileCacheService
 *
 * @example
 * ```typescript
 * @Component({...})
 * export class ActivityPageComponent {
 *   private readonly activity = inject(ActivityService);
 *
 *   readonly items = this.activity.items;
 *   readonly isLoading = this.activity.isLoading;
 *   readonly activeTab = this.activity.activeTab;
 *
 *   async onTabChange(tabId: ActivityTabId): Promise<void> {
 *     await this.activity.loadFeed(tabId);
 *   }
 * }
 * ```
 */

import { Injectable, inject, signal, computed } from '@angular/core';
import {
  type ActivityItem,
  type ActivityTabId,
  type ActivityPagination,
  type ActivityFeedResponse,
  ACTIVITY_DEFAULT_TAB,
  ACTIVITY_TABS,
  ACTIVITY_PAGINATION_DEFAULTS,
  ACTIVITY_CACHE_KEYS,
  ACTIVITY_CACHE_TTL,
} from '@nxt1/core';
import { HapticsService, NxtToastService, NxtLoggingService } from '@nxt1/ui';
import { ActivityApiService } from './activity-api.service';
import { MobileCacheService } from '../../../core/services';

/** Mock badge counts for development */
const MOCK_BADGE_COUNTS: Record<ActivityTabId, number> = {
  all: 7,
  inbox: 4,
  agent: 2,
  reactions: 4,
};

/**
 * Activity state management service.
 * Provides reactive state for the activity/notifications interface.
 */
@Injectable({ providedIn: 'root' })
export class ActivityService {
  private readonly api = inject(ActivityApiService);
  private readonly cache = inject(MobileCacheService);
  private readonly haptics = inject(HapticsService);
  private readonly toast = inject(NxtToastService);
  private readonly logger = inject(NxtLoggingService).child('ActivityService');

  // ============================================
  // PRIVATE WRITEABLE SIGNALS
  // ============================================

  private readonly _items = signal<ActivityItem[]>([]);
  private readonly _activeTab = signal<ActivityTabId>(ACTIVITY_DEFAULT_TAB);
  private readonly _badges = signal<Record<ActivityTabId, number>>(MOCK_BADGE_COUNTS);
  private readonly _isLoading = signal(false);
  private readonly _isLoadingMore = signal(false);
  private readonly _isRefreshing = signal(false);
  private readonly _error = signal<string | null>(null);
  private readonly _pagination = signal<ActivityPagination | null>(null);

  // ============================================
  // PUBLIC READONLY COMPUTED SIGNALS
  // ============================================

  /** Current activity items */
  readonly items = computed(() => this._items());

  /** Currently active tab */
  readonly activeTab = computed(() => this._activeTab());

  /** Badge counts per tab */
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
  readonly isEmpty = computed(() => this._items().length === 0 && !this._isLoading());

  /** Whether there are more items to load */
  readonly hasMore = computed(() => this._pagination()?.hasMore ?? false);

  /** Total unread count across all tabs */
  readonly totalUnread = computed(() => {
    const badges = this._badges();
    return Object.values(badges).reduce((sum, count) => sum + count, 0);
  });

  /** Badge count for current tab */
  readonly currentTabBadge = computed(() => {
    const tab = this._activeTab();
    return this._badges()[tab] ?? 0;
  });

  /** Tabs with badge counts merged */
  readonly tabsWithBadges = computed(() => {
    const badges = this._badges();
    return ACTIVITY_TABS.map((tab) => ({
      ...tab,
      badge: badges[tab.id] ?? 0,
    }));
  });

  /** Unread items in current tab */
  readonly unreadItems = computed(() => {
    return this._items().filter((item) => !item.isRead);
  });

  // ============================================
  // PUBLIC METHODS
  // ============================================

  /**
   * Load activity feed for a tab.
   * Uses cache-first strategy: check cache, return if fresh, fetch in background if stale.
   */
  async loadFeed(tab: ActivityTabId): Promise<void> {
    this._activeTab.set(tab);
    this._error.set(null);
    this._isLoading.set(true);
    this._pagination.set(null);

    const cacheKey = `${ACTIVITY_CACHE_KEYS.FEED_PREFIX}${tab}:1`;
    this.logger.debug('Loading activity feed', { tab, cacheKey });

    try {
      // Cache-first: Try cache first, then fetch
      const response = await this.cache.getOrFetch<ActivityFeedResponse>(
        cacheKey,
        () =>
          this.api.getFeed({
            tab,
            page: 1,
            limit: ACTIVITY_PAGINATION_DEFAULTS.pageSize,
          }),
        ACTIVITY_CACHE_TTL.FEED
      );

      this._items.set([...(response.items ?? [])]);
      this._pagination.set(response.pagination ?? null);

      await this.haptics.impact('light');
      this.logger.debug('Activity feed loaded', {
        tab,
        itemCount: response.items?.length ?? 0,
        fromCache: true,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load activity';
      this._error.set(message);
      this.logger.error('Failed to load activity feed', err, { tab });
    } finally {
      this._isLoading.set(false);
    }
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
    const nextPage = pagination.page + 1;

    this.logger.debug('Loading more activity items', { tab, page: nextPage });

    try {
      const response = await this.api.getFeed({
        tab,
        page: nextPage,
        limit: pagination.limit,
      });

      this._items.update((items) => [...items, ...(response.items ?? [])]);
      this._pagination.set(response.pagination ?? null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load more';
      this.toast.error(message);
      this.logger.error('Failed to load more activity items', err, { tab, page: nextPage });
    } finally {
      this._isLoadingMore.set(false);
    }
  }

  /**
   * Refresh current tab (pull-to-refresh).
   * Bypasses cache to get fresh data.
   */
  async refresh(): Promise<void> {
    if (this._isRefreshing()) return;

    this._isRefreshing.set(true);
    const tab = this._activeTab();
    const cacheKey = `${ACTIVITY_CACHE_KEYS.FEED_PREFIX}${tab}:1`;

    this.logger.debug('Refreshing activity feed (bypassing cache)', { tab });

    try {
      // Invalidate cache first to force fresh fetch
      await this.cache.delete(cacheKey);

      const response = await this.api.getFeed({
        tab,
        page: 1,
        limit: ACTIVITY_PAGINATION_DEFAULTS.pageSize,
      });

      // Update cache with fresh data
      await this.cache.set(cacheKey, response, 'both', ACTIVITY_CACHE_TTL.FEED);

      this._items.set([...(response.items ?? [])]);
      this._pagination.set(response.pagination ?? null);

      await this.haptics.notification('success');
      this.logger.debug('Activity feed refreshed', { tab, itemCount: response.items?.length ?? 0 });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to refresh';
      this.toast.error(message);
      this.logger.error('Failed to refresh activity feed', err, { tab });
    } finally {
      this._isRefreshing.set(false);
    }
  }

  /**
   * Mark specific items as read.
   */
  async markRead(ids: string[]): Promise<void> {
    if (ids.length === 0) return;

    // Optimistic update
    const previousItems = this._items();
    this._items.update((items) =>
      items.map((item) => (ids.includes(item.id) ? { ...item, isRead: true } : item))
    );

    this.logger.debug('Marking items as read', { count: ids.length });

    try {
      await this.api.markRead(ids);

      // Update badge count
      const tab = this._activeTab();
      this._badges.update((badges) => ({
        ...badges,
        [tab]: Math.max(0, (badges[tab] ?? 0) - ids.length),
      }));

      await this.haptics.impact('light');
    } catch (err) {
      // Rollback on failure
      this._items.set(previousItems);
      const message = err instanceof Error ? err.message : 'Failed to mark as read';
      this.toast.error(message);
      this.logger.error('Failed to mark items as read', err, { ids });
    }
  }

  /**
   * Mark all items in current tab as read.
   */
  async markAllRead(): Promise<void> {
    const tab = this._activeTab();
    const unreadCount = this.unreadItems().length;

    if (unreadCount === 0) return;

    // Optimistic update
    const previousItems = this._items();
    this._items.update((items) => items.map((item) => ({ ...item, isRead: true })));

    this.logger.debug('Marking all as read', { tab, count: unreadCount });

    try {
      await this.api.markAllRead(tab);

      // Reset badge count for this tab
      this._badges.update((badges) => ({
        ...badges,
        [tab]: 0,
      }));

      this.toast.success('All marked as read');
      await this.haptics.notification('success');
    } catch (err) {
      // Rollback on failure
      this._items.set(previousItems);
      const message = err instanceof Error ? err.message : 'Failed to mark all as read';
      this.toast.error(message);
      this.logger.error('Failed to mark all as read', err, { tab });
    }
  }

  /**
   * Archive an activity item.
   */
  async archive(id: string): Promise<void> {
    // Optimistic update
    const previousItems = this._items();
    this._items.update((items) => items.filter((item) => item.id !== id));

    this.logger.debug('Archiving item', { id });

    try {
      await this.api.archive([id]);
      await this.haptics.impact('medium');
    } catch (err) {
      // Rollback on failure
      this._items.set(previousItems);
      const message = err instanceof Error ? err.message : 'Failed to archive';
      this.toast.error(message);
      this.logger.error('Failed to archive item', err, { id });
    }
  }

  /**
   * Refresh badge counts from backend.
   */
  async refreshBadges(): Promise<void> {
    this.logger.debug('Refreshing badge counts');

    try {
      const badges = await this.api.getBadges();
      this._badges.set(badges);
    } catch (err) {
      this.logger.error('Failed to refresh badge counts', err);
    }
  }

  /**
   * Change active tab with haptics.
   */
  async switchTab(tab: ActivityTabId): Promise<void> {
    if (tab === this._activeTab()) return;

    await this.haptics.impact('light');
    await this.loadFeed(tab);
  }

  /**
   * Clear error state.
   */
  clearError(): void {
    this._error.set(null);
  }
}
