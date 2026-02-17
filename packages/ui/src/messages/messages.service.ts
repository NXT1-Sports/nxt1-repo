/**
 * @fileoverview Messages Service — Shared State Management
 * @module @nxt1/ui/messages
 * @version 1.0.0
 *
 * Signal-based state management for Messages/Conversations feature.
 * Shared between web and mobile applications.
 *
 * Features:
 * - Reactive state with Angular signals
 * - Filter-based conversation lists
 * - Conversation search
 * - Infinite scroll pagination
 * - Unread count tracking
 * - Pull-to-refresh support
 *
 * @example
 * ```typescript
 * @Component({...})
 * export class MessagesPageComponent {
 *   private readonly messages = inject(MessagesService);
 *
 *   readonly conversations = this.messages.conversations;
 *   readonly isLoading = this.messages.isLoading;
 *   readonly activeFilter = this.messages.activeFilter;
 *
 *   async onFilterChange(filterId: MessagesFilterId): Promise<void> {
 *     await this.messages.loadConversations(filterId);
 *   }
 * }
 * ```
 */

import { Injectable, inject, signal, computed } from '@angular/core';
import {
  type Conversation,
  type MessagesFilterId,
  type MessagesPagination,
  MESSAGES_DEFAULT_FILTER,
  MESSAGES_FILTERS,
  MESSAGES_PAGINATION_DEFAULTS,
  MESSAGES_SEARCH_CONFIG,
} from '@nxt1/core';
import { HapticsService } from '../services/haptics/haptics.service';
import { NxtToastService } from '../services/toast/toast.service';
import { NxtLoggingService } from '../services/logging/logging.service';
// ⚠️ TEMPORARY: Mock data for development (remove when backend is ready)
import { getMockConversations, getMockUnreadCount, getMockFilterCount } from './messages.mock-data';

/**
 * Messages state management service.
 * Provides reactive state for the conversations interface.
 */
@Injectable({ providedIn: 'root' })
export class MessagesService {
  // ⚠️ TEMPORARY: API service commented out — using mock data
  // private readonly api = inject(MessagesApiService);
  private readonly haptics = inject(HapticsService);
  private readonly toast = inject(NxtToastService);
  private readonly logger = inject(NxtLoggingService).child('MessagesService');

  // ============================================
  // PRIVATE WRITEABLE SIGNALS
  // ============================================

  private readonly _conversations = signal<Conversation[]>([]);
  private readonly _activeFilter = signal<MessagesFilterId>(MESSAGES_DEFAULT_FILTER);
  private readonly _searchQuery = signal('');
  private readonly _isLoading = signal(false);
  private readonly _isLoadingMore = signal(false);
  private readonly _isRefreshing = signal(false);
  private readonly _error = signal<string | null>(null);
  private readonly _pagination = signal<MessagesPagination | null>(null);
  private readonly _totalUnreadCount = signal(getMockUnreadCount());

  // ============================================
  // PUBLIC READONLY COMPUTED SIGNALS
  // ============================================

  /** Current conversation list */
  readonly conversations = computed(() => this._conversations());

  /** Active filter tab */
  readonly activeFilter = computed(() => this._activeFilter());

  /** Current search query */
  readonly searchQuery = computed(() => this._searchQuery());

  /** Whether initial load is in progress */
  readonly isLoading = computed(() => this._isLoading());

  /** Whether loading more items */
  readonly isLoadingMore = computed(() => this._isLoadingMore());

  /** Whether refresh is in progress */
  readonly isRefreshing = computed(() => this._isRefreshing());

  /** Current error message */
  readonly error = computed(() => this._error());

  /** Current pagination info */
  readonly pagination = computed(() => this._pagination());

  /** Whether the conversation list is empty */
  readonly isEmpty = computed(() => this._conversations().length === 0 && !this._isLoading());

  /** Whether there are more pages to load */
  readonly hasMore = computed(() => this._pagination()?.hasMore ?? false);

  /** Total unread count across all conversations */
  readonly totalUnreadCount = computed(() => this._totalUnreadCount());

  /** Whether search is active */
  readonly hasSearchQuery = computed(
    () => this._searchQuery().length >= MESSAGES_SEARCH_CONFIG.minQueryLength
  );

  /** Filter tabs with live counts */
  readonly filtersWithCounts = computed(() =>
    MESSAGES_FILTERS.map((filter) => ({
      ...filter,
      count: filter.id === 'unread' ? getMockFilterCount('unread') : undefined,
    }))
  );

  /** Pinned conversations */
  readonly pinnedConversations = computed(() => this._conversations().filter((c) => c.isPinned));

  /** Non-pinned conversations */
  readonly regularConversations = computed(() => this._conversations().filter((c) => !c.isPinned));

  // ============================================
  // PUBLIC METHODS
  // ============================================

  /**
   * Load conversations for a given filter.
   */
  async loadConversations(filter?: MessagesFilterId): Promise<void> {
    const activeFilter = filter ?? this._activeFilter();

    if (filter) {
      this._activeFilter.set(filter);
    }

    this._isLoading.set(true);
    this._error.set(null);

    try {
      // ⚠️ TEMPORARY: Simulate network delay
      await this.simulateDelay(400);

      const result = getMockConversations(
        activeFilter,
        this._searchQuery(),
        1,
        MESSAGES_PAGINATION_DEFAULTS.conversationsPageSize
      );

      this._conversations.set(result.conversations);
      this._totalUnreadCount.set(getMockUnreadCount());
      this._pagination.set({
        page: 1,
        limit: MESSAGES_PAGINATION_DEFAULTS.conversationsPageSize,
        total: result.total,
        totalPages: Math.ceil(result.total / MESSAGES_PAGINATION_DEFAULTS.conversationsPageSize),
        hasMore: result.hasMore,
      });

      this.logger.debug('Conversations loaded', {
        filter: activeFilter,
        count: result.conversations.length,
        total: result.total,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load conversations';
      this._error.set(message);
      this.logger.error('Failed to load conversations', { error: message });
    } finally {
      this._isLoading.set(false);
    }
  }

  /**
   * Load more conversations (infinite scroll).
   */
  async loadMore(): Promise<void> {
    const pagination = this._pagination();
    if (!pagination?.hasMore || this._isLoadingMore()) return;

    this._isLoadingMore.set(true);

    try {
      const nextPage = pagination.page + 1;

      // ⚠️ TEMPORARY: Simulate network delay
      await this.simulateDelay(300);

      const result = getMockConversations(
        this._activeFilter(),
        this._searchQuery(),
        nextPage,
        MESSAGES_PAGINATION_DEFAULTS.conversationsPageSize
      );

      this._conversations.update((current) => [...current, ...result.conversations]);
      this._pagination.set({
        page: nextPage,
        limit: MESSAGES_PAGINATION_DEFAULTS.conversationsPageSize,
        total: result.total,
        totalPages: Math.ceil(result.total / MESSAGES_PAGINATION_DEFAULTS.conversationsPageSize),
        hasMore: result.hasMore,
      });

      this.logger.debug('More conversations loaded', { page: nextPage });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load more conversations';
      this.toast.error(message);
      this.logger.error('Failed to load more', { error: message });
    } finally {
      this._isLoadingMore.set(false);
    }
  }

  /**
   * Switch active filter and reload conversations.
   */
  async switchFilter(filter: MessagesFilterId): Promise<void> {
    if (filter === this._activeFilter()) return;

    await this.haptics.impact('light');
    this._searchQuery.set('');
    await this.loadConversations(filter);
  }

  /**
   * Search conversations.
   */
  async search(query: string): Promise<void> {
    this._searchQuery.set(query);

    if (query.length < MESSAGES_SEARCH_CONFIG.minQueryLength) {
      await this.loadConversations();
      return;
    }

    await this.loadConversations();
  }

  /**
   * Clear search query and reload.
   */
  async clearSearch(): Promise<void> {
    this._searchQuery.set('');
    await this.loadConversations();
  }

  /**
   * Refresh the conversation list (pull-to-refresh).
   */
  async refresh(): Promise<void> {
    this._isRefreshing.set(true);
    await this.haptics.impact('light');

    try {
      await this.loadConversations();
    } finally {
      this._isRefreshing.set(false);
    }
  }

  /**
   * Mark a conversation as read (optimistic).
   */
  async markAsRead(conversationId: string): Promise<void> {
    const previous = this._conversations();
    const previousConversation = previous.find((c) => c.id === conversationId);
    const previousUnreadCount = previousConversation?.unreadCount ?? 0;

    // Optimistic update
    this._conversations.update((convos) =>
      convos.map((c) => (c.id === conversationId ? { ...c, unreadCount: 0 } : c))
    );
    if (previousUnreadCount > 0) {
      this._totalUnreadCount.update((count) => Math.max(0, count - previousUnreadCount));
    }

    try {
      // ⚠️ TEMPORARY: No backend call yet
      await this.simulateDelay(100);
      this.logger.debug('Conversation marked as read', { conversationId });
    } catch {
      // Rollback on failure
      this._conversations.set(previous);
      this.toast.error('Failed to mark as read');
    }
  }

  /**
   * Archive a conversation (optimistic).
   */
  async archiveConversation(conversationId: string): Promise<void> {
    const previous = this._conversations();
    const previousConversation = previous.find((c) => c.id === conversationId);
    const previousUnreadCount = previousConversation?.unreadCount ?? 0;

    // Optimistic: remove from list
    this._conversations.update((convos) => convos.filter((c) => c.id !== conversationId));
    if (previousUnreadCount > 0) {
      this._totalUnreadCount.update((count) => Math.max(0, count - previousUnreadCount));
    }

    try {
      // ⚠️ TEMPORARY: No backend call yet
      await this.simulateDelay(200);
      await this.haptics.notification('success');
      this.toast.success('Conversation archived');
      this.logger.debug('Conversation archived', { conversationId });
    } catch {
      this._conversations.set(previous);
      this.toast.error('Failed to archive conversation');
    }
  }

  /**
   * Delete a conversation (optimistic).
   */
  async deleteConversation(conversationId: string): Promise<void> {
    const previous = this._conversations();
    const previousConversation = previous.find((c) => c.id === conversationId);
    const previousUnreadCount = previousConversation?.unreadCount ?? 0;

    this._conversations.update((convos) => convos.filter((c) => c.id !== conversationId));
    if (previousUnreadCount > 0) {
      this._totalUnreadCount.update((count) => Math.max(0, count - previousUnreadCount));
    }

    try {
      // ⚠️ TEMPORARY: No backend call yet
      await this.simulateDelay(200);
      await this.haptics.notification('success');
      this.toast.success('Conversation deleted');
      this.logger.debug('Conversation deleted', { conversationId });
    } catch {
      this._conversations.set(previous);
      this.toast.error('Failed to delete conversation');
    }
  }

  /**
   * Clear current error state.
   */
  clearError(): void {
    this._error.set(null);
  }

  // ============================================
  // PRIVATE HELPERS
  // ============================================

  /** Simulate network delay for mock data. */
  private simulateDelay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
