/**
 * @fileoverview Activity Service - Shared State Management
 * @module @nxt1/ui/activity
 * @version 2.0.0
 *
 * Signal-based state management for Activity/Notifications feature.
 * Shared between web and mobile applications.
 *
 * Single-tab (alerts) architecture — all notifications flow through one feed.
 *
 * Features:
 * - Reactive state with Angular signals
 * - Page-reentry cache (avoids skeleton flash on navigate-back)
 * - Badge count tracking
 * - Infinite scroll pagination
 * - Mark read/unread functionality
 * - Pull-to-refresh support
 * - Real-time item prepend (push notifications)
 *
 * @example
 * ```typescript
 * @Component({...})
 * export class ActivityPageComponent {
 *   private readonly activity = inject(ActivityService);
 *
 *   readonly items = this.activity.items;
 *   readonly isLoading = this.activity.isLoading;
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
  ACTIVITY_PAGINATION_DEFAULTS,
} from '@nxt1/core';
import { HapticsService } from '../services/haptics/haptics.service';
import { NxtToastService } from '../services/toast/toast.service';
import { NxtLoggingService } from '../services/logging/logging.service';
import { NxtBreadcrumbService } from '../services/breadcrumb';
import { ACTIVITY_API_ADAPTER } from './activity-api.service';

/**
 * Activity state management service.
 * Provides reactive state for the activity/notifications interface.
 */
@Injectable({ providedIn: 'root' })
export class ActivityService {
  private readonly api = inject(ACTIVITY_API_ADAPTER);
  private readonly haptics = inject(HapticsService);
  private readonly toast = inject(NxtToastService);
  private readonly logger = inject(NxtLoggingService).child('ActivityService');
  private readonly breadcrumbs = inject(NxtBreadcrumbService);

  // ============================================
  // PRIVATE WRITEABLE SIGNALS
  // ============================================

  private readonly _items = signal<ActivityItem[]>([]);
  private readonly _activeTab = signal<ActivityTabId>(ACTIVITY_DEFAULT_TAB);
  private readonly _badges = signal<Record<ActivityTabId, number>>({
    alerts: 0,
  });
  private readonly _isLoading = signal(false);
  private readonly _isLoadingMore = signal(false);
  private readonly _isRefreshing = signal(false);
  private readonly _error = signal<string | null>(null);
  private readonly _pagination = signal<ActivityPagination | null>(null);

  /** Cached feed data — avoids skeleton flash when navigating back to /activity */
  private _cache: { items: ActivityItem[]; pagination: ActivityPagination | null } | null = null;

  // ============================================
  // PUBLIC READONLY COMPUTED SIGNALS
  // ============================================

  /** Current activity items */
  readonly items = computed(() => this._items());

  /** Currently active tab (always 'alerts') */
  readonly activeTab = computed(() => this._activeTab());

  /** Unified items — alias for items (kept for template compatibility) */
  readonly unifiedItems = computed((): ActivityItem[] => this._items());

  /** Badge counts */
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

  /** Total unread count */
  readonly totalUnread = computed(() => this._badges()['alerts'] ?? 0);

  /** Badge count for current tab */
  readonly currentTabBadge = computed(() => this._badges()['alerts'] ?? 0);

  /** Unread items */
  readonly unreadItems = computed(() => {
    return this._items().filter((item) => !item.isRead);
  });

  // ============================================
  // PUBLIC METHODS
  // ============================================

  /**
   * Load activity feed.
   * On first load: shows skeleton → fetches from API → caches result.
   * On re-entry: restores cached data instantly → silently refreshes from API.
   */
  async loadFeed(tab: ActivityTabId = 'alerts'): Promise<void> {
    this._activeTab.set(tab);
    this._error.set(null);
    await this.breadcrumbs.trackStateChange('activity_load_feed', { tab });

    // Restore cached data instantly to avoid skeleton flash on page re-entry
    if (this._cache) {
      this._items.set(this._cache.items);
      this._pagination.set(this._cache.pagination);
    } else {
      this._items.set([]);
      this._isLoading.set(true);
      this._pagination.set(null);
    }

    this.logger.debug('Loading activity feed', { cached: !!this._cache });

    try {
      let response: ActivityFeedResponse;
      try {
        response = await this.api.getFeed({
          tab,
          page: 1,
          limit: ACTIVITY_PAGINATION_DEFAULTS.pageSize,
        });
      } catch {
        // API unavailable — use empty response
        this.logger.warn('Activity API unavailable, using fallback');
        response = { success: true, items: [] };
      }

      const items = response.items ? [...response.items] : [];

      this._items.set(items);
      this._pagination.set(response.pagination ?? null);

      // Cache for instant restore on page re-entry
      this._cache = { items, pagination: response.pagination ?? null };

      if (response.badges) {
        this._badges.set(response.badges);
      }

      await this.haptics.impact('light');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load activity';
      this._error.set(message);
      this.logger.error('Failed to load activity feed', err);
    } finally {
      this._isLoading.set(false);
    }
  }

  /**
   * Load more items (infinite scroll).
   * Appends items to existing list.
   */
  async loadMore(): Promise<void> {
    const pagination = this._pagination();
    if (!pagination?.hasMore || this._isLoadingMore() || this._isLoading()) {
      return;
    }

    this._isLoadingMore.set(true);
    const nextPage = pagination.page + 1;

    this.logger.debug('Loading more activity items', { page: nextPage });

    try {
      const response = await this.api.getFeed({
        tab: 'alerts',
        page: nextPage,
        limit: pagination.limit,
      });

      this._items.update((items) => [...items, ...(response.items ?? [])]);
      this._pagination.set(response.pagination ?? null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load more';
      this.toast.error(message);
      this.logger.error('Failed to load more activity items', err, { page: nextPage });
    } finally {
      this._isLoadingMore.set(false);
    }
  }

  /**
   * Refresh feed (pull-to-refresh).
   * Replaces all items with fresh data.
   */
  async refresh(): Promise<void> {
    if (this._isRefreshing()) return;

    this._isRefreshing.set(true);

    this.logger.debug('Refreshing activity feed');
    await this.breadcrumbs.trackStateChange('activity_refresh_start', {});

    try {
      const response = await this.api.getFeed({
        tab: 'alerts',
        page: 1,
        limit: ACTIVITY_PAGINATION_DEFAULTS.pageSize,
      });

      const items = response.items ? [...response.items] : [];
      this._items.set(items);
      this._pagination.set(response.pagination ?? null);
      this._cache = { items, pagination: response.pagination ?? null };

      if (response.badges) {
        this._badges.set(response.badges);
      }

      await this.haptics.notification('success');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to refresh';
      this.toast.error(message);
      this.logger.error('Failed to refresh activity feed', err);
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
      const response = await this.api.markRead(ids);

      if (response.badges) {
        this._badges.set(response.badges);
      } else {
        this._badges.update((badges) => ({
          ...badges,
          alerts: Math.max(0, (badges['alerts'] ?? 0) - ids.length),
        }));
      }

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
   * Mark all items as read.
   */
  async markAllRead(): Promise<void> {
    const unreadCount = this.unreadItems().length;
    if (unreadCount === 0) return;

    // Optimistic update
    const previousItems = this._items();
    const previousBadges = this._badges();
    this._items.update((items) => items.map((item) => ({ ...item, isRead: true })));
    this._badges.update((badges) => ({ ...badges, alerts: 0 }));

    this.logger.debug('Marking all as read', { count: unreadCount });
    await this.breadcrumbs.trackStateChange('activity_mark_all_read', { count: unreadCount });

    try {
      const response = await this.api.markAllRead('alerts');

      if (response.badges) {
        this._badges.set(response.badges);
      }

      this.toast.success('All marked as read');
      await this.haptics.notification('success');
    } catch (err) {
      // Rollback on failure
      this._items.set(previousItems);
      this._badges.set(previousBadges);
      const message = err instanceof Error ? err.message : 'Failed to mark all as read';
      this.toast.error(message);
      this.logger.error('Failed to mark all as read', err);
    }
  }

  /**
   * Archive an activity item.
   */
  async archive(id: string): Promise<void> {
    const previousItems = this._items();
    this._items.update((items) => items.filter((item) => item.id !== id));

    this.logger.debug('Archiving item', { id });
    await this.breadcrumbs.trackUserAction('activity_archive', { id });

    try {
      await this.api.archive([id]);
      await this.haptics.impact('medium');
    } catch (err) {
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
   * Switch tab (no-op since there's only one tab, kept for interface compatibility).
   */
  async switchTab(tab: ActivityTabId): Promise<void> {
    if (tab === this._activeTab()) return;
    await this.loadFeed(tab);
  }

  /**
   * Clear error state.
   */
  clearError(): void {
    this._error.set(null);
  }

  // ============================================
  // REAL-TIME HELPERS (Push / Foreground Updates)
  // ============================================

  /**
   * Prepend a new activity item received in real-time (e.g.,
   * from a push notification foreground event or a Firestore listener).
   * Avoids duplicates by checking the item ID.
   */
  prependItem(item: ActivityItem): void {
    const existing = this._items();
    if (existing.some((i) => i.id === item.id)) return;

    this._items.update((items) => [item, ...items]);

    // Invalidate cache so next page entry shows fresh data
    this._cache = null;

    if (!item.isRead) {
      this._badges.update((badges) => ({
        ...badges,
        alerts: (badges['alerts'] ?? 0) + 1,
      }));
    }

    this.logger.debug('Prepended real-time activity item', { id: item.id });
  }

  /**
   * Increment badge count.
   * Used by PushHandlerService when a foreground push is received
   * but the full activity item hasn't been fetched yet.
   */
  incrementBadge(tab: ActivityTabId = 'alerts'): void {
    this._badges.update((badges) => ({
      ...badges,
      [tab]: (badges[tab] ?? 0) + 1,
    }));
  }
}
