/**
 * @fileoverview Conversation → ActivityItem Mapper
 * @module @nxt1/core/activity
 * @version 1.0.0
 *
 * Pure TypeScript mapper that converts a Conversation into an ActivityItem.
 * This enables the unified activity feed where messages render through
 * the same ActivityItemComponent as all other activity items.
 *
 * 100% portable — no framework dependencies.
 *
 * @example
 * ```typescript
 * import { conversationToActivityItem } from '@nxt1/core';
 *
 * const activityItem = conversationToActivityItem(conversation);
 * // → ActivityItem with type: 'message', message-specific metadata
 * ```
 */

import type { Conversation } from '../messages/messages.types';
import type { ActivityItem } from './activity.types';

/**
 * Metadata keys stored on converted message ActivityItems.
 * Used by ActivityItemComponent to render message-specific UI.
 */
export interface MessageActivityMetadata {
  /** Original conversation ID (for navigation) */
  readonly conversationId: string;
  /** Conversation type (direct, group, team, coach) */
  readonly conversationType: string;
  /** Whether the other participant is online (DMs) */
  readonly isOnline?: boolean;
  /** Whether any participant is verified */
  readonly isVerified?: boolean;
  /** Whether the conversation is muted */
  readonly isMuted?: boolean;
  /** Whether the conversation is pinned */
  readonly isPinned?: boolean;
  /** Number of unread messages (for badge count) */
  readonly unreadCount: number;
  /** Whether the last message was sent by the current user */
  readonly isOwnLastMessage?: boolean;
  /** Last message sender name (for group chats) */
  readonly lastMessageSender?: string;
  /** Number of participants (for group indicator) */
  readonly participantCount?: number;
}

/**
 * Convert a Conversation into an ActivityItem for unified rendering.
 *
 * Maps conversation fields to the ActivityItem interface:
 * - `conversation.title` → `item.title` (contact/group name)
 * - `conversation.lastMessage.body` → `item.body` (message preview with "You: " prefix)
 * - `conversation.avatarUrl` → `item.source.avatarUrl`
 * - `conversation.lastMessage.timestamp` → `item.timestamp`
 * - `conversation.unreadCount > 0` → `!item.isRead`
 * - Message-specific data → `item.metadata` (online status, verified, muted, etc.)
 *
 * @param conversation - The conversation to convert
 * @returns An ActivityItem with type 'message' and message-specific metadata
 */
export function conversationToActivityItem(conversation: Conversation): ActivityItem {
  const lastMessage = conversation.lastMessage;
  const hasUnread = conversation.unreadCount > 0;

  // Build body with "You: " prefix for own messages
  let body: string | undefined;
  if (lastMessage?.body) {
    body = lastMessage.isOwn ? `You: ${lastMessage.body}` : lastMessage.body;
  }

  // Build metadata with message-specific fields
  const metadata: Record<string, unknown> = {
    conversationId: conversation.id,
    conversationType: conversation.type,
    isOnline: conversation.isOnline,
    isVerified: conversation.hasVerifiedParticipant,
    isMuted: conversation.isMuted,
    isPinned: conversation.isPinned,
    unreadCount: conversation.unreadCount,
    isOwnLastMessage: lastMessage?.isOwn,
    lastMessageSender: lastMessage?.senderName,
    participantCount: conversation.participants.length,
  };

  return {
    id: `msg-${conversation.id}`,
    type: 'message',
    tab: 'alerts',
    priority: 'normal',
    title: conversation.title,
    body,
    timestamp: lastMessage?.timestamp ?? conversation.updatedAt,
    isRead: !hasUnread,
    source: {
      userId: conversation.participants[0]?.id,
      userName: conversation.title,
      avatarUrl: conversation.avatarUrl,
    },
    deepLink: `/messages/${conversation.id}`,
    metadata,
  };
}

/**
 * Convert an array of Conversations to ActivityItems.
 *
 * @param conversations - Array of conversations to convert
 * @returns Array of ActivityItems with type 'message'
 */
export function conversationsToActivityItems(
  conversations: readonly Conversation[]
): ActivityItem[] {
  return conversations.map(conversationToActivityItem);
}
