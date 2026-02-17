/**
 * @fileoverview Conversation Thread Service — Shared State Management
 * @module @nxt1/ui/messages/conversation
 * @version 1.0.0
 *
 * Signal-based state management for a single conversation thread.
 * Handles loading messages, sending, typing indicators, reply context,
 * and optimistic message insertion.
 *
 * ⭐ SHARED — Works on both web and mobile ⭐
 */

import { Injectable, inject, signal, computed } from '@angular/core';
import {
  type Conversation,
  type Message,
  type ConversationParticipant,
  type MessagesPagination,
  MESSAGES_PAGINATION_DEFAULTS,
  MESSAGES_UI_CONFIG,
} from '@nxt1/core';
import { HapticsService } from '../../services/haptics/haptics.service';
import { NxtToastService } from '../../services/toast/toast.service';
import { NxtLoggingService } from '../../services/logging/logging.service';
import { MessagesService } from '../messages.service';
// ⚠️ TEMPORARY: Mock data for development (remove when backend is ready)
import { getMockThreadMessages, MOCK_CONVERSATIONS } from '../messages.mock-data';

/**
 * Conversation thread state management service.
 * Manages messages for a single open conversation.
 */
@Injectable({ providedIn: 'root' })
export class ConversationService {
  private readonly haptics = inject(HapticsService);
  private readonly toast = inject(NxtToastService);
  private readonly logger = inject(NxtLoggingService).child('ConversationService');
  private readonly messagesService = inject(MessagesService);

  // ============================================
  // PRIVATE WRITEABLE SIGNALS
  // ============================================

  private readonly _conversation = signal<Conversation | null>(null);
  private readonly _messages = signal<Message[]>([]);
  private readonly _isLoading = signal(false);
  private readonly _isLoadingMore = signal(false);
  private readonly _isSending = signal(false);
  private readonly _error = signal<string | null>(null);
  private readonly _pagination = signal<MessagesPagination | null>(null);
  private readonly _replyTo = signal<Message | null>(null);
  private readonly _typingUsers = signal<ConversationParticipant[]>([]);

  // ============================================
  // PUBLIC READONLY COMPUTED SIGNALS
  // ============================================

  /** The current conversation metadata */
  readonly conversation = computed(() => this._conversation());

  /** Messages in the conversation, ordered oldest → newest */
  readonly messages = computed(() => this._messages());

  /** Whether the initial thread is loading */
  readonly isLoading = computed(() => this._isLoading());

  /** Whether loading older messages */
  readonly isLoadingMore = computed(() => this._isLoadingMore());

  /** Whether a message is being sent */
  readonly isSending = computed(() => this._isSending());

  /** Current error message */
  readonly error = computed(() => this._error());

  /** Current pagination info */
  readonly pagination = computed(() => this._pagination());

  /** Whether we can load older messages */
  readonly hasMore = computed(() => this._pagination()?.hasMore ?? false);

  /** Message being replied to */
  readonly replyTo = computed(() => this._replyTo());

  /** Users currently typing */
  readonly typingUsers = computed(() => this._typingUsers());

  /** Whether anyone is typing */
  readonly isTyping = computed(() => this._typingUsers().length > 0);

  /** Typing indicator text */
  readonly typingText = computed(() => {
    const users = this._typingUsers();
    if (users.length === 0) return '';
    if (users.length === 1) return `${users[0].name} is typing...`;
    if (users.length === 2) return `${users[0].name} and ${users[1].name} are typing...`;
    return `${users[0].name} and ${users.length - 1} others are typing...`;
  });

  /** The other participant(s) — everyone except 'current-user' */
  readonly otherParticipants = computed(() => {
    const conv = this._conversation();
    if (!conv) return [];
    return conv.participants.filter((p) => p.id !== 'current-user');
  });

  /** Whether the conversation is empty */
  readonly isEmpty = computed(() => this._messages().length === 0 && !this._isLoading());

  /** Conversation title (from conversation metadata) */
  readonly title = computed(() => this._conversation()?.title ?? '');

  /** Subtitle: online status or last seen */
  readonly subtitle = computed(() => {
    const conv = this._conversation();
    if (!conv) return '';

    if (conv.type === 'group' || conv.type === 'team') {
      return `${conv.participants.length} members`;
    }

    const other = this.otherParticipants();
    if (other.length === 0) return '';

    const participant = other[0];
    if (participant.isOnline) return 'Online';

    if (participant.lastSeen) {
      return `Last seen ${this.formatLastSeen(participant.lastSeen)}`;
    }

    return '';
  });

  /** Whether the other participant is online (DMs only) */
  readonly isOnline = computed(() => {
    const conv = this._conversation();
    if (!conv || conv.type !== 'direct') return false;
    const other = this.otherParticipants();
    return other.length > 0 && !!other[0].isOnline;
  });

  /** Group messages by date for date separators */
  readonly groupedMessages = computed(() => {
    const msgs = this._messages();
    if (msgs.length === 0) return [];

    const groups: { date: string; label: string; messages: Message[] }[] = [];
    let currentGroup: { date: string; label: string; messages: Message[] } | null = null;

    for (const msg of msgs) {
      const dateStr = new Date(msg.timestamp).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });

      if (!currentGroup || currentGroup.date !== dateStr) {
        currentGroup = {
          date: dateStr,
          label: this.formatDateLabel(msg.timestamp),
          messages: [],
        };
        groups.push(currentGroup);
      }

      currentGroup.messages.push(msg);
    }

    return groups;
  });

  // ============================================
  // PUBLIC METHODS
  // ============================================

  /**
   * Open and load a conversation thread by ID.
   */
  async openConversation(conversationId: string): Promise<void> {
    this._isLoading.set(true);
    this._error.set(null);
    this._messages.set([]);
    this._replyTo.set(null);
    this._typingUsers.set([]);

    try {
      // ⚠️ TEMPORARY: Simulate network delay
      await this.simulateDelay(500);

      // ⚠️ TEMPORARY: Find conversation from mock data
      const conversation = MOCK_CONVERSATIONS.find((c) => c.id === conversationId) ?? null;

      if (!conversation) {
        this._error.set('Conversation not found');
        this.logger.warn('Conversation not found', { conversationId });
        return;
      }

      this._conversation.set(conversation);

      // Load thread messages
      const messages = getMockThreadMessages(conversationId);
      this._messages.set(messages);

      this._pagination.set({
        page: 1,
        limit: MESSAGES_PAGINATION_DEFAULTS.messagesPageSize,
        total: messages.length,
        totalPages: 1,
        hasMore: false, // Mock data has no pagination
      });

      // Mark conversation as read
      if (conversation.unreadCount > 0) {
        await this.messagesService.markAsRead(conversationId);
      }

      this.logger.debug('Conversation opened', {
        conversationId,
        messageCount: messages.length,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load conversation';
      this._error.set(message);
      this.logger.error('Failed to open conversation', { error: message });
    } finally {
      this._isLoading.set(false);
    }
  }

  /**
   * Load older messages (scroll-to-top pagination).
   */
  async loadMore(): Promise<void> {
    const pagination = this._pagination();
    if (!pagination?.hasMore || this._isLoadingMore()) return;

    this._isLoadingMore.set(true);

    try {
      // ⚠️ TEMPORARY: Simulate delay — no real pagination in mock data
      await this.simulateDelay(400);

      this.logger.debug('Loaded older messages');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load older messages';
      this.toast.error(message);
      this.logger.error('Failed to load more', { error: message });
    } finally {
      this._isLoadingMore.set(false);
    }
  }

  /**
   * Send a new message (optimistic insertion).
   */
  async sendMessage(body: string): Promise<void> {
    const trimmed = body.trim();
    if (!trimmed || this._isSending()) return;

    const conversation = this._conversation();
    if (!conversation) return;

    // Validate length
    if (trimmed.length > MESSAGES_UI_CONFIG.maxMessageLength) {
      this.toast.error(`Message too long (max ${MESSAGES_UI_CONFIG.maxMessageLength} characters)`);
      return;
    }

    this._isSending.set(true);

    // Create optimistic message
    const tempId = `temp-${Date.now()}`;
    const optimisticMessage: Message = {
      id: tempId,
      conversationId: conversation.id,
      sender: {
        id: 'current-user',
        name: 'You',
        role: 'athlete',
        isOnline: true,
      },
      body: trimmed,
      timestamp: new Date().toISOString(),
      status: 'sending',
      isOwn: true,
      replyTo: this._replyTo()
        ? {
            id: this._replyTo()!.id,
            senderName: this._replyTo()!.sender.name,
            preview:
              this._replyTo()!.body.length > 100
                ? this._replyTo()!.body.substring(0, 100) + '...'
                : this._replyTo()!.body,
          }
        : undefined,
    };

    // Optimistic insert
    this._messages.update((msgs) => [...msgs, optimisticMessage]);
    this._replyTo.set(null);

    try {
      // ⚠️ TEMPORARY: Simulate network delay
      await this.simulateDelay(600);

      // Update message status to sent
      this._messages.update((msgs) =>
        msgs.map((m) =>
          m.id === tempId ? { ...m, id: `msg-${Date.now()}`, status: 'sent' as const } : m
        )
      );

      await this.haptics.notification('success');

      this.logger.debug('Message sent', {
        conversationId: conversation.id,
        length: trimmed.length,
      });
    } catch (err) {
      // Mark as failed
      this._messages.update((msgs) =>
        msgs.map((m) => (m.id === tempId ? { ...m, status: 'failed' as const } : m))
      );

      await this.haptics.notification('error');
      this.toast.error('Failed to send message');
      this.logger.error('Failed to send message', {
        error: err instanceof Error ? err.message : 'Unknown error',
      });
    } finally {
      this._isSending.set(false);
    }
  }

  /**
   * Retry sending a failed message.
   */
  async retrySend(messageId: string): Promise<void> {
    const failedMessage = this._messages().find((m) => m.id === messageId && m.status === 'failed');
    if (!failedMessage) return;

    // Remove failed message and re-send
    this._messages.update((msgs) => msgs.filter((m) => m.id !== messageId));
    await this.sendMessage(failedMessage.body);
  }

  /**
   * Set a message as the reply-to context.
   */
  setReplyTo(message: Message): void {
    this._replyTo.set(message);
    this.haptics.impact('light');
  }

  /**
   * Clear the reply-to context.
   */
  clearReplyTo(): void {
    this._replyTo.set(null);
  }

  /**
   * Close the conversation and clean up state.
   */
  closeConversation(): void {
    this._conversation.set(null);
    this._messages.set([]);
    this._error.set(null);
    this._pagination.set(null);
    this._replyTo.set(null);
    this._typingUsers.set([]);
    this._isSending.set(false);
    this._isLoading.set(false);
    this._isLoadingMore.set(false);
    this.logger.debug('Conversation closed');
  }

  /**
   * Clear error state.
   */
  clearError(): void {
    this._error.set(null);
  }

  // ============================================
  // PRIVATE HELPERS
  // ============================================

  /** Format last seen timestamp to relative text */
  private formatLastSeen(timestamp: string): string {
    const date = new Date(timestamp);
    const seconds = Math.floor((Date.now() - date.getTime()) / 1000);

    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;

    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  /** Format date label for date separators */
  private formatDateLabel(timestamp: string): string {
    const date = new Date(timestamp);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) return 'Today';
    if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';

    const diffDays = Math.floor((today.getTime() - date.getTime()) / 86_400_000);
    if (diffDays < 7) {
      return date.toLocaleDateString('en-US', { weekday: 'long' });
    }

    return date.toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: date.getFullYear() !== today.getFullYear() ? 'numeric' : undefined,
    });
  }

  /** Simulate network delay for mock data. */
  private simulateDelay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
