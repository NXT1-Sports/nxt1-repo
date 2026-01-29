/**
 * @fileoverview Activity Service - Shared State Management
 * @module @nxt1/ui/activity
 * @version 1.0.0
 *
 * Signal-based state management for Activity/Notifications feature.
 * Shared between web and mobile applications.
 *
 * Features:
 * - Reactive state with Angular signals
 * - Tab-based feed management
 * - Badge counts tracking
 * - Infinite scroll pagination
 * - Mark read/unread functionality
 * - Pull-to-refresh support
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
  ACTIVITY_DEFAULT_TAB,
  ACTIVITY_TABS,
  ACTIVITY_PAGINATION_DEFAULTS,
} from '@nxt1/core';
import { HapticsService } from '../services/haptics/haptics.service';
import { NxtToastService } from '../services/toast/toast.service';
import { NxtLoggingService } from '../services/logging/logging.service';
// ⚠️ TEMPORARY: Mock data for development (remove when backend is ready)
import {
  getMockActivityItems,
  getMockItemCount,
  getMockUnreadCount,
  MOCK_BADGE_COUNTS,
} from './activity.mock-data';

/**
 * Activity state management service.
 * Provides reactive state for the activity/notifications interface.
 */
@Injectable({ providedIn: 'root' })
export class ActivityService {
  // ⚠️ TEMPORARY: API service commented out - using mock data
  // private readonly api = inject(ActivityApiService);
  private readonly haptics = inject(HapticsService);
  private readonly toast = inject(NxtToastService);
  private readonly logger = inject(NxtLoggingService).child('ActivityService');

  // ============================================
  // PRIVATE WRITEABLE SIGNALS
  // ============================================

  private readonly _items = signal<ActivityItem[]>([]);
  private readonly _activeTab = signal<ActivityTabId>(ACTIVITY_DEFAULT_TAB);
  // ⚠️ TEMPORARY: Using mock badge counts
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
   * Resets items and loads fresh data.
   *
   * @param tab - Tab ID to load
   */
  async loadFeed(tab: ActivityTabId): Promise<void> {
    this._activeTab.set(tab);
    this._items.set([]);
    this._error.set(null);
    this._isLoading.set(true);
    this._pagination.set(null);

    this.logger.debug('Loading activity feed', { tab });

    // ⚠️ TEMPORARY: Using mock data instead of API call
    try {
      // Simulate network delay
      await new Promise((resolve) => setTimeout(resolve, 300));

      const items = getMockActivityItems(tab, 1, ACTIVITY_PAGINATION_DEFAULTS.pageSize);
      const total = getMockItemCount(tab);
      const totalPages = Math.ceil(total / ACTIVITY_PAGINATION_DEFAULTS.pageSize);
      const hasMore = items.length < total;

      this._items.set(items);
      this._pagination.set({
        page: 1,
        limit: ACTIVITY_PAGINATION_DEFAULTS.pageSize,
        total,
        totalPages,
        hasMore,
      });

      await this.haptics.impact('light');
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
   * Appends items to existing list.
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

    // ⚠️ TEMPORARY: Using mock data instead of API call
    try {
      // Simulate network delay
      await new Promise((resolve) => setTimeout(resolve, 300));

      const newItems = getMockActivityItems(tab, nextPage, pagination.limit);
      const total = getMockItemCount(tab);
      const allItems = [...this._items(), ...newItems];
      const totalPages = Math.ceil(total / pagination.limit);
      const hasMore = allItems.length < total;

      this._items.set(allItems);
      this._pagination.set({
        page: nextPage,
        limit: pagination.limit,
        total,
        totalPages,
        hasMore,
      });
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
   * Replaces all items with fresh data.
   */
  async refresh(): Promise<void> {
    if (this._isRefreshing()) return;

    this._isRefreshing.set(true);
    const tab = this._activeTab();

    this.logger.debug('Refreshing activity feed', { tab });

    // ⚠️ TEMPORARY: Using mock data instead of API call
    try {
      // Simulate network delay
      await new Promise((resolve) => setTimeout(resolve, 500));

      const items = getMockActivityItems(tab, 1, ACTIVITY_PAGINATION_DEFAULTS.pageSize);
      const total = getMockItemCount(tab);
      const totalPages = Math.ceil(total / ACTIVITY_PAGINATION_DEFAULTS.pageSize);
      const hasMore = items.length < total;

      this._items.set(items);
      this._pagination.set({
        page: 1,
        limit: ACTIVITY_PAGINATION_DEFAULTS.pageSize,
        total,
        totalPages,
        hasMore,
      });

      await this.haptics.notification('success');
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
   *
   * @param ids - Item IDs to mark as read
   */
  async markRead(ids: string[]): Promise<void> {
    if (ids.length === 0) return;

    // Optimistic update
    const previousItems = this._items();
    this._items.update((items) =>
      items.map((item) => (ids.includes(item.id) ? { ...item, isRead: true } : item))
    );

    this.logger.debug('Marking items as read', { count: ids.length });

    // ⚠️ TEMPORARY: Mock implementation without API call
    try {
      // Simulate network delay
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Update badge count
      const tab = this._activeTab();
      const newUnreadCount = getMockUnreadCount(tab) - ids.length;
      this._badges.update((badges) => ({
        ...badges,
        [tab]: Math.max(0, newUnreadCount),
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

    // ⚠️ TEMPORARY: Mock implementation without API call
    try {
      // Simulate network delay
      await new Promise((resolve) => setTimeout(resolve, 300));

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
   *
   * @param id - Item ID to archive
   */
  async archive(id: string): Promise<void> {
    // Optimistic update
    const previousItems = this._items();
    this._items.update((items) => items.filter((item) => item.id !== id));

    this.logger.debug('Archiving item', { id });

    // ⚠️ TEMPORARY: Mock implementation without API call
    try {
      // Simulate network delay
      await new Promise((resolve) => setTimeout(resolve, 200));
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
   * ⚠️ TEMPORARY: Mock implementation
   */
  async refreshBadges(): Promise<void> {
    this.logger.debug('Refreshing badge counts');

    // Mock implementation - badges are already set from MOCK_BADGE_COUNTS
    // No backend call needed during development
  }

  /**
   * Change active tab with haptics.
   *
   * @param tab - Tab ID to switch to
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
