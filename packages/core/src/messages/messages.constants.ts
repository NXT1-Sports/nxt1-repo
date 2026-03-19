/**
 * @fileoverview Messages Constants
 * @module @nxt1/core/messages
 * @version 1.0.0
 *
 * Configuration constants for Messages/Conversations feature.
 * 100% portable — no platform dependencies.
 */

import type { MessagesFilter, MessagesFilterId, MessagesPagination } from './messages.types';

// ============================================
// FILTER CONFIGURATION
// ============================================

/**
 * Available conversation filter tabs.
 * Order determines display order in the filter bar.
 */
export const MESSAGES_FILTERS: readonly MessagesFilter[] = [
  { id: 'all', label: 'All', icon: 'chatbubbles-outline' },
  { id: 'unread', label: 'Unread', icon: 'mail-unread-outline' },
] as const;

/**
 * Default selected filter tab.
 */
export const MESSAGES_DEFAULT_FILTER: MessagesFilterId = 'all';

// ============================================
// PAGINATION DEFAULTS
// ============================================

export const MESSAGES_PAGINATION_DEFAULTS = {
  /** Number of conversations to load per page */
  conversationsPageSize: 20,
  /** Number of messages to load per page in a thread */
  messagesPageSize: 30,
  /** Infinite scroll distance threshold (px) */
  infiniteScrollThreshold: 200,
  /** Max cached threads */
  maxCachedThreads: 10,
} as const;

// ============================================
// CACHE CONFIGURATION
// ============================================

export const MESSAGES_CACHE_KEYS = {
  /** Conversation list cache */
  conversations: 'messages:conversations:',
  /** Individual thread cache */
  thread: 'messages:thread:',
  /** Unread counts cache */
  unreadCounts: 'messages:unread',
  /** Search results cache */
  searchResults: 'messages:search:',
} as const;

export const MESSAGES_CACHE_TTL = {
  /** Conversation list TTL (1 minute) */
  conversations: 60_000,
  /** Thread messages TTL (30 seconds — messages update fast) */
  thread: 30_000,
  /** Unread counts TTL (30 seconds) */
  unreadCounts: 30_000,
  /** Search results TTL (2 minutes) */
  searchResults: 120_000,
} as const;

// ============================================
// SEARCH CONFIGURATION
// ============================================

export const MESSAGES_SEARCH_CONFIG = {
  /** Minimum query length to trigger search */
  minQueryLength: 1,
  /** Debounce delay in ms */
  debounceMs: 250,
  /** Max recent searches to store */
  maxRecentSearches: 5,
  /** Search input placeholder */
  placeholder: 'Search conversations',
} as const;

// ============================================
// EMPTY STATE CONFIGURATION
// ============================================

export const MESSAGES_EMPTY_STATES: Record<
  MessagesFilterId,
  { readonly title: string; readonly message: string; readonly icon: string }
> = {
  all: {
    title: 'No conversations yet',
    message: 'Start connecting with coaches, recruiters, and teammates',
    icon: 'messages',
  },
  unread: {
    title: 'All caught up',
    message: "You've read all your messages — nice work!",
    icon: 'checkmarkDone',
  },
} as const;

// ============================================
// API ENDPOINTS
// ============================================

export const MESSAGES_API_ENDPOINTS = {
  /** List conversations */
  conversations: '/messages/conversations',
  /** Single conversation thread */
  thread: '/messages/thread',
  /** Send a message */
  send: '/messages/send',
  /** Create new conversation */
  create: '/messages/create',
  /** Mark conversation as read */
  markRead: '/messages/read',
  /** Mute conversation */
  mute: '/messages/mute',
  /** Pin conversation */
  pin: '/messages/pin',
  /** Delete conversation */
  delete: '/messages/delete',
  /** Search conversations */
  search: '/messages/search',
  /** Unread count summary */
  unreadCount: '/messages/unread-count',
} as const;

// ============================================
// UI CONFIGURATION
// ============================================

export const MESSAGES_UI_CONFIG = {
  /** Height of a conversation list item (px) */
  conversationItemHeight: 72,
  /** Height of a message bubble (approx min) */
  messageBubbleMinHeight: 40,
  /** Number of skeleton items during loading */
  skeletonCount: 6,
  /** Animation duration (ms) */
  animationDuration: 200,
  /** Max message length */
  maxMessageLength: 2000,
  /** Typing indicator timeout (ms) */
  typingIndicatorTimeout: 3000,
} as const;

// ============================================
// INITIAL PAGINATION
// ============================================

export const MESSAGES_INITIAL_PAGINATION: MessagesPagination = {
  page: 1,
  limit: MESSAGES_PAGINATION_DEFAULTS.conversationsPageSize,
  total: 0,
  totalPages: 0,
  hasMore: false,
};
