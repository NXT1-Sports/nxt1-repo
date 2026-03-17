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
  conversationsToActivityItems,
} from '@nxt1/core';
import { APP_EVENTS } from '@nxt1/core/analytics';
import { HapticsService } from '../services/haptics/haptics.service';
import { NxtToastService } from '../services/toast/toast.service';
import { NxtLoggingService } from '../services/logging/logging.service';
import { ANALYTICS_ADAPTER } from '../services/analytics/analytics-adapter.token';
import { NxtBreadcrumbService } from '../services/breadcrumb';
import { MessagesService } from '../messages/messages.service';
import { ActivityApiService } from './activity-api.service';

/**
 * Activity state management service.
 * Provides reactive state for the activity/notifications interface.
 */
@Injectable({ providedIn: 'root' })
export class ActivityService {
  private readonly api = inject(ActivityApiService);
  private readonly haptics = inject(HapticsService);
  private readonly toast = inject(NxtToastService);
  private readonly logger = inject(NxtLoggingService).child('ActivityService');
  private readonly analytics = inject(ANALYTICS_ADAPTER, { optional: true });
  private readonly breadcrumbs = inject(NxtBreadcrumbService);
  private readonly messagesService = inject(MessagesService);

  // ============================================
  // PRIVATE WRITEABLE SIGNALS
  // ============================================

  private readonly _items = signal<ActivityItem[]>([]);
  private readonly _activeTab = signal<ActivityTabId>(ACTIVITY_DEFAULT_TAB);
  private readonly _badges = signal<Record<ActivityTabId, number>>({
    all: 0,
    inbox: 0,
    agent: 0,
    alerts: 0,
  });
  private readonly _isLoading = signal(false);
  private readonly _isLoadingMore = signal(false);
  private readonly _isRefreshing = signal(false);
  private readonly _error = signal<string | null>(null);
  private readonly _pagination = signal<ActivityPagination | null>(null);

  /** Per-tab cache: avoids skeleton flash on tab switch */
  private readonly _tabCache = new Map<
    ActivityTabId,
    { items: ActivityItem[]; pagination: ActivityPagination | null }
  >();

  // ============================================
  // PUBLIC READONLY COMPUTED SIGNALS
  // ============================================

  /** Current activity items */
  readonly items = computed(() => this._items());

  /** Currently active tab */
  readonly activeTab = computed(() => this._activeTab());

  /**
   * Unified items for the active tab.
   * - 'inbox': Conversations converted to ActivityItems
   * - 'all': Merged conversations + activity items, sorted by timestamp
   * - Other tabs: Regular activity items only
   */
  readonly unifiedItems = computed((): ActivityItem[] => {
    const tab = this._activeTab();

    if (tab === 'inbox') {
      // Inbox: only conversations as ActivityItems
      const conversations = this.messagesService.conversations();
      return conversationsToActivityItems(conversations);
    }

    if (tab === 'all') {
      // All: merge conversations + activity items, sorted by timestamp
      const conversations = this.messagesService.conversations();
      const messageItems = conversationsToActivityItems(conversations);
      const activityItems = this._items();
      const merged = [...messageItems, ...activityItems];
      return merged.sort(
        (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );
    }

    // Agent, Alerts: regular activity items only
    return this._items();
  });

  /** Badge counts per tab */
  readonly badges = computed(() => this._badges());

  /** Whether initial load is in progress (suppressed for cached tabs to avoid skeleton flash) */
  readonly isLoading = computed(() => {
    const tab = this._activeTab();
    if (tab === 'inbox') return this.messagesService.isLoading();
    if (tab === 'all') return this._isLoading() || this.messagesService.isLoading();
    return this._isLoading();
  });

  /** Whether loading more items */
  readonly isLoadingMore = computed(() => this._isLoadingMore());

  /** Whether refreshing */
  readonly isRefreshing = computed(() => this._isRefreshing());

  /** Current error message (includes message service errors for inbox/all tabs) */
  readonly error = computed(() => {
    const tab = this._activeTab();
    const activityError = this._error();
    const messagesError = this.messagesService.error();

    if (tab === 'inbox') return messagesError;
    if (tab === 'all') return activityError ?? messagesError;
    return activityError;
  });

  /** Current pagination info */
  readonly pagination = computed(() => this._pagination());

  /** Whether the feed is empty (uses unified items) */
  readonly isEmpty = computed(() => {
    const tab = this._activeTab();
    const isLoadingActivity = this._isLoading();
    const isLoadingMessages = this.messagesService.isLoading();

    // For tabs that include messages, check both loading states
    if (tab === 'inbox') {
      return this.messagesService.isEmpty() && !isLoadingMessages;
    }
    if (tab === 'all') {
      return this.unifiedItems().length === 0 && !isLoadingActivity && !isLoadingMessages;
    }
    return this._items().length === 0 && !isLoadingActivity;
  });

  /** Whether there are more items to load */
  readonly hasMore = computed(() => this._pagination()?.hasMore ?? false);

  /** Total unread count (uses 'all' tab which is the authoritative total from backend) */
  readonly totalUnread = computed(() => this._badges()['all'] ?? 0);

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
   * For inbox/all tabs, also loads conversations from MessagesService.
   *
   * @param tab - Tab ID to load
   */
  async loadFeed(tab: ActivityTabId): Promise<void> {
    this._activeTab.set(tab);
    this._error.set(null);
    this.analytics?.trackEvent(APP_EVENTS.SCREEN_VIEWED, {
      screen: 'activity',
      tab,
    });
    await this.breadcrumbs.trackStateChange('activity_load_feed', { tab });

    // TODO: Re-enable when backend /messages routes are ready
    // if (tab === 'inbox' || tab === 'all') {
    //   this.messagesService.loadConversations();
    // }

    // Inbox tab only needs conversations — skip activity API data
    if (tab === 'inbox') {
      this._items.set([]);
      this._pagination.set(null);
      return;
    }

    // Restore cached data instantly to avoid skeleton flash on tab switch
    const cached = this._tabCache.get(tab);
    if (cached) {
      this._items.set(cached.items);
      this._pagination.set(cached.pagination);
    } else {
      this._items.set([]);
      this._isLoading.set(true);
      this._pagination.set(null);
    }

    this.logger.debug('Loading activity feed', { tab, cached: !!cached });

    try {
      const response = await this.api.getFeed({
        tab,
        page: 1,
        limit: ACTIVITY_PAGINATION_DEFAULTS.pageSize,
      });

      const items = response.items ? [...response.items] : [];
      this._items.set(items);
      this._pagination.set(response.pagination ?? null);

      // Cache for instant restore on tab switch
      this._tabCache.set(tab, { items, pagination: response.pagination ?? null });

      if (response.badges) {
        this._badges.set(response.badges);
      }

      this.analytics?.trackEvent(APP_EVENTS.TAB_CHANGED, {
        tab,
        count: items.length,
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
   * Replaces all items with fresh data.
   * For inbox/all tabs, also refreshes conversations.
   */
  async refresh(): Promise<void> {
    if (this._isRefreshing()) return;

    this._isRefreshing.set(true);
    const tab = this._activeTab();

    this.logger.debug('Refreshing activity feed', { tab });
    await this.breadcrumbs.trackStateChange('activity_refresh_start', { tab });

    // TODO: Re-enable when backend /messages routes are ready
    // For inbox tab — only refresh messages
    // if (tab === 'inbox') {
    //   try {
    //     await this.messagesService.refresh();
    //     await this.haptics.notification('success');
    //   } catch (err) {
    //     const message = err instanceof Error ? err.message : 'Failed to refresh';
    //     this.toast.error(message);
    //     this.logger.error('Failed to refresh messages', err, { tab });
    //   } finally {
    //     this._isRefreshing.set(false);
    //   }
    //   return;
    // }

    // For all tab — refresh both in parallel
    // TODO: Re-enable messagesService.refresh() in Promise.allSettled when backend /messages routes are ready
    if (tab === 'all') {
      try {
        await this.refreshActivityData();
        this.analytics?.trackEvent(APP_EVENTS.TAB_CHANGED, {
          tab,
          action: 'refresh',
        });
        await this.haptics.notification('success');
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to refresh';
        this.toast.error(message);
        this.logger.error('Failed to refresh combined feed', err, { tab });
      } finally {
        this._isRefreshing.set(false);
      }
      return;
    }

    // For other tabs — refresh activity data only
    try {
      await this.refreshActivityData();
      this.analytics?.trackEvent(APP_EVENTS.TAB_CHANGED, {
        tab,
        action: 'refresh',
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
   * For message-type items, delegates to MessagesService.
   *
   * @param ids - Item IDs to mark as read
   */
  async markRead(ids: string[]): Promise<void> {
    if (ids.length === 0) return;

    // Separate message IDs (prefixed with "msg-") from regular activity IDs
    const messageIds = ids
      .filter((id) => id.startsWith('msg-'))
      .map((id) => id.replace('msg-', ''));
    const activityIds = ids.filter((id) => !id.startsWith('msg-'));

    // Mark message conversations as read via MessagesService
    for (const msgId of messageIds) {
      this.messagesService.markAsRead(msgId);
    }

    if (activityIds.length === 0) return;

    // Optimistic update for activity items
    const previousItems = this._items();
    this._items.update((items) =>
      items.map((item) => (activityIds.includes(item.id) ? { ...item, isRead: true } : item))
    );

    this.logger.debug('Marking items as read', { count: activityIds.length });

    try {
      const response = await this.api.markRead(activityIds);

      // Update badge counts from server response
      if (response.badges) {
        this._badges.set(response.badges);
      } else {
        const tab = this._activeTab();
        this._badges.update((badges) => ({
          ...badges,
          all: Math.max(0, (badges['all'] ?? 0) - activityIds.length),
          [tab]: Math.max(0, (badges[tab] ?? 0) - activityIds.length),
        }));
      }

      this.analytics?.trackEvent(APP_EVENTS.TAB_CHANGED, {
        tab: this._activeTab(),
        action: 'mark_read',
        count: activityIds.length,
      });

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
    await this.breadcrumbs.trackStateChange('activity_mark_all_read', {
      tab,
      count: unreadCount,
    });

    try {
      const response = await this.api.markAllRead(tab);

      // Update badge counts from server response
      if (response.badges) {
        this._badges.set(response.badges);
      } else {
        this._badges.update((badges) => ({
          ...badges,
          all: Math.max(0, (badges['all'] ?? 0) - unreadCount),
          [tab]: 0,
        }));
      }

      this.analytics?.trackEvent(APP_EVENTS.TAB_CHANGED, {
        tab,
        action: 'mark_all_read',
      });

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
    await this.breadcrumbs.trackUserAction('activity_archive', {
      id,
      tab: this._activeTab(),
    });

    try {
      await this.api.archive([id]);
      this.analytics?.trackEvent(APP_EVENTS.TAB_CHANGED, {
        tab: this._activeTab(),
        action: 'archive',
      });
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
   *
   * @param tab - Tab ID to switch to
   */
  async switchTab(tab: ActivityTabId): Promise<void> {
    if (tab === this._activeTab()) return;

    this.analytics?.trackEvent(APP_EVENTS.TAB_CHANGED, { tab, source: 'activity_tabs' });
    await this.breadcrumbs.trackStateChange('activity_tab_changed', { tab });
    await this.haptics.impact('light');
    await this.loadFeed(tab);
  }

  /**
   * Clear error state.
   */
  clearError(): void {
    this._error.set(null);
    this.messagesService.clearError();
  }

  // ============================================
  // PRIVATE HELPERS
  // ============================================

  /**
   * Refresh only the activity data (not messages).
   * Used internally by refresh() for parallel refresh on 'all' tab.
   */
  private async refreshActivityData(): Promise<void> {
    const tab = this._activeTab();

    const response = await this.api.getFeed({
      tab,
      page: 1,
      limit: ACTIVITY_PAGINATION_DEFAULTS.pageSize,
    });

    this._items.set(response.items ? [...response.items] : []);
    this._pagination.set(response.pagination ?? null);

    if (response.badges) {
      this._badges.set(response.badges);
    }
  }

  // ============================================
  // REAL-TIME HELPERS (Push / Foreground Updates)
  // ============================================

  /**
   * Prepend a new activity item received in real-time (e.g.,
   * from a push notification foreground event or a Firestore listener).
   *
   * Avoids duplicates by checking the item ID.
   * Also increments the badge for the item's tab and the 'all' tab.
   */
  prependItem(item: ActivityItem): void {
    // Avoid duplicates
    const existing = this._items();
    if (existing.some((i) => i.id === item.id)) return;

    this._items.update((items) => [item, ...items]);

    // Invalidate tab cache so the next tab switch shows fresh data
    this._tabCache.delete(item.tab);
    this._tabCache.delete('all');

    // Increment badge for the relevant tab + 'all'
    if (!item.isRead) {
      this._badges.update((badges) => ({
        ...badges,
        [item.tab]: (badges[item.tab] ?? 0) + 1,
        all: (badges['all'] ?? 0) + 1,
      }));
    }

    this.logger.debug('Prepended real-time activity item', { id: item.id, tab: item.tab });
  }

  /**
   * Increment badge count for a specific tab.
   * Used by PushHandlerService when a foreground push is received
   * but the full activity item hasn't been fetched yet.
   */
  incrementBadge(tab: ActivityTabId = 'agent'): void {
    this._badges.update((badges) => ({
      ...badges,
      [tab]: (badges[tab] ?? 0) + 1,
      all: (badges['all'] ?? 0) + 1,
    }));
  }
}
