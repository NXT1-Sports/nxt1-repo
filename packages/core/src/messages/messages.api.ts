/**
 * @fileoverview Messages API Factory
 * @module @nxt1/core/messages
 * @version 1.0.0
 *
 * Pure TypeScript API factory for Messages/Conversations feature.
 * Uses HttpAdapter pattern for platform-agnostic HTTP calls.
 *
 * @example
 * ```typescript
 * const api = createMessagesApi(httpAdapter, '/api/v1');
 * const conversations = await api.getConversations('all', 1);
 * ```
 */

import type { HttpAdapter } from '../api';
import type {
  Conversation,
  ConversationsResponse,
  Message,
  MessagesThreadResponse,
  MessagesFilterId,
  SendMessageRequest,
  CreateConversationRequest,
} from './messages.types';
import {
  MESSAGES_API_ENDPOINTS,
  MESSAGES_PAGINATION_DEFAULTS,
  MESSAGES_INITIAL_PAGINATION,
} from './messages.constants';

/**
 * Generic API response wrapper.
 */
interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Create a Messages API instance.
 *
 * @param http - Platform-specific HTTP adapter
 * @param baseUrl - Base API URL (e.g., '/api/v1' or environment.apiUrl)
 * @returns Type-safe API object
 */
export function createMessagesApi(http: HttpAdapter, baseUrl: string) {
  return {
    /**
     * Fetch paginated conversation list.
     */
    async getConversations(
      filter: MessagesFilterId = 'all',
      page: number = 1,
      query?: string
    ): Promise<ConversationsResponse> {
      const params = new URLSearchParams({
        filter,
        page: String(page),
        limit: String(MESSAGES_PAGINATION_DEFAULTS.conversationsPageSize),
      });

      if (query && query.trim().length > 0) {
        params.append('q', query.trim());
      }

      const url = `${baseUrl}${MESSAGES_API_ENDPOINTS.conversations}?${params.toString()}`;
      const response = await http.get<ApiResponse<ConversationsResponse>>(url);

      if (!response.success || !response.data) {
        return {
          success: false,
          conversations: [],
          pagination: MESSAGES_INITIAL_PAGINATION,
          error: response.error ?? 'Failed to load conversations',
        };
      }

      return response.data;
    },

    /**
     * Fetch messages for a specific conversation thread.
     */
    async getThread(conversationId: string, page: number = 1): Promise<MessagesThreadResponse> {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(MESSAGES_PAGINATION_DEFAULTS.messagesPageSize),
      });

      const url = `${baseUrl}${MESSAGES_API_ENDPOINTS.thread}/${conversationId}?${params.toString()}`;
      const response = await http.get<ApiResponse<MessagesThreadResponse>>(url);

      if (!response.success || !response.data) {
        return {
          success: false,
          conversation: { id: conversationId } as Conversation,
          messages: [],
          pagination: MESSAGES_INITIAL_PAGINATION,
          error: response.error ?? 'Failed to load messages',
        };
      }

      return response.data;
    },

    /**
     * Send a message to a conversation.
     */
    async sendMessage(request: SendMessageRequest): Promise<Message> {
      const url = `${baseUrl}${MESSAGES_API_ENDPOINTS.send}`;
      const response = await http.post<ApiResponse<Message>>(url, request);

      if (!response.success || !response.data) {
        throw new Error(response.error ?? 'Failed to send message');
      }

      return response.data;
    },

    /**
     * Create a new conversation.
     */
    async createConversation(request: CreateConversationRequest): Promise<Conversation> {
      const url = `${baseUrl}${MESSAGES_API_ENDPOINTS.create}`;
      const response = await http.post<ApiResponse<Conversation>>(url, request);

      if (!response.success || !response.data) {
        throw new Error(response.error ?? 'Failed to create conversation');
      }

      return response.data;
    },

    /**
     * Mark a conversation as read.
     */
    async markAsRead(conversationId: string): Promise<void> {
      const url = `${baseUrl}${MESSAGES_API_ENDPOINTS.markRead}/${conversationId}`;
      const response = await http.put<ApiResponse<void>>(url, {});

      if (!response.success) {
        throw new Error(response.error ?? 'Failed to mark conversation as read');
      }
    },

    /**
     * Archive a conversation.
     */
    async archiveConversation(conversationId: string): Promise<void> {
      const url = `${baseUrl}${MESSAGES_API_ENDPOINTS.archive}/${conversationId}`;
      const response = await http.put<ApiResponse<void>>(url, {});

      if (!response.success) {
        throw new Error(response.error ?? 'Failed to archive conversation');
      }
    },

    /**
     * Mute/unmute a conversation.
     */
    async toggleMute(conversationId: string, muted: boolean): Promise<void> {
      const url = `${baseUrl}${MESSAGES_API_ENDPOINTS.mute}/${conversationId}`;
      const response = await http.put<ApiResponse<void>>(url, { muted });

      if (!response.success) {
        throw new Error(response.error ?? 'Failed to update mute setting');
      }
    },

    /**
     * Pin/unpin a conversation.
     */
    async togglePin(conversationId: string, pinned: boolean): Promise<void> {
      const url = `${baseUrl}${MESSAGES_API_ENDPOINTS.pin}/${conversationId}`;
      const response = await http.put<ApiResponse<void>>(url, { pinned });

      if (!response.success) {
        throw new Error(response.error ?? 'Failed to update pin setting');
      }
    },

    /**
     * Delete a conversation.
     */
    async deleteConversation(conversationId: string): Promise<void> {
      const url = `${baseUrl}${MESSAGES_API_ENDPOINTS.delete}/${conversationId}`;
      const response = await http.delete<ApiResponse<void>>(url);

      if (!response.success) {
        throw new Error(response.error ?? 'Failed to delete conversation');
      }
    },

    /**
     * Get total unread message count.
     */
    async getUnreadCount(): Promise<number> {
      const url = `${baseUrl}${MESSAGES_API_ENDPOINTS.unreadCount}`;
      const response = await http.get<ApiResponse<{ count: number }>>(url);

      return response.success && response.data ? response.data.count : 0;
    },
  } as const;
}

export type MessagesApi = ReturnType<typeof createMessagesApi>;
