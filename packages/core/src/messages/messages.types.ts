/**
 * @fileoverview Messages Type Definitions
 * @module @nxt1/core/messages
 * @version 1.0.0
 *
 * Pure TypeScript type definitions for the Messages/Conversations feature.
 * 100% portable — works on web, mobile, and backend.
 */

// ============================================
// CONVERSATION TYPES
// ============================================

/**
 * Message delivery/read status.
 */
export type MessageStatus = 'sending' | 'sent' | 'delivered' | 'read' | 'failed';

/**
 * Conversation type identifier.
 */
export type ConversationType = 'direct' | 'group' | 'team' | 'coach';

/**
 * Participant role within a conversation.
 */
export type ParticipantRole = 'athlete' | 'coach' | 'recruiter' | 'parent' | 'admin';

/**
 * A participant in a conversation.
 */
export interface ConversationParticipant {
  /** User's unique identifier */
  readonly id: string;
  /** Display name */
  readonly name: string;
  /** Avatar/profile image URL */
  readonly avatarUrl?: string;
  /** Participant's role */
  readonly role: ParticipantRole;
  /** Whether the user is verified */
  readonly isVerified?: boolean;
  /** Whether the user is currently online */
  readonly isOnline?: boolean;
  /** Last seen timestamp (ISO 8601) */
  readonly lastSeen?: string;
}

/**
 * A message attachment (image, video, file, etc.).
 */
export interface MessageAttachment {
  /** Unique attachment ID */
  readonly id: string;
  /** Attachment type */
  readonly type: 'image' | 'video' | 'file' | 'link';
  /** Display name / filename */
  readonly name: string;
  /** Source URL */
  readonly url: string;
  /** Thumbnail URL (for images/videos) */
  readonly thumbnailUrl?: string;
  /** File size in bytes */
  readonly size?: number;
  /** MIME type */
  readonly mimeType?: string;
  /** Duration in seconds (for video/audio) */
  readonly duration?: number;
}

/**
 * A single message within a conversation.
 */
export interface Message {
  /** Unique message ID */
  readonly id: string;
  /** Conversation this message belongs to */
  readonly conversationId: string;
  /** Sender information */
  readonly sender: ConversationParticipant;
  /** Message body text */
  readonly body: string;
  /** Message timestamp (ISO 8601) */
  readonly timestamp: string;
  /** Delivery/read status */
  readonly status: MessageStatus;
  /** Attachments (images, files, etc.) */
  readonly attachments?: readonly MessageAttachment[];
  /** Whether this is the current user's message */
  readonly isOwn?: boolean;
  /** Whether the message has been edited */
  readonly isEdited?: boolean;
  /** Reply-to message reference */
  readonly replyTo?: {
    readonly id: string;
    readonly senderName: string;
    readonly preview: string;
  };
}

/**
 * Conversation thread (inbox list item).
 */
export interface Conversation {
  /** Unique conversation ID */
  readonly id: string;
  /** Conversation type */
  readonly type: ConversationType;
  /** Conversation title (group name, or participant name for DMs) */
  readonly title: string;
  /** Avatar URL (group icon, or other participant's avatar) */
  readonly avatarUrl?: string;
  /** Participants in the conversation */
  readonly participants: readonly ConversationParticipant[];
  /** Most recent message preview */
  readonly lastMessage?: {
    readonly body: string;
    readonly senderName: string;
    readonly timestamp: string;
    readonly isOwn: boolean;
  };
  /** Number of unread messages */
  readonly unreadCount: number;
  /** Whether the conversation is muted */
  readonly isMuted?: boolean;
  /** Whether the conversation is pinned */
  readonly isPinned?: boolean;
  /** Whether the conversation is archived */
  readonly isArchived?: boolean;
  /** Whether any participant is verified */
  readonly hasVerifiedParticipant?: boolean;
  /** Online status of the other participant (DMs only) */
  readonly isOnline?: boolean;
  /** Conversation creation timestamp */
  readonly createdAt: string;
  /** Last activity timestamp */
  readonly updatedAt: string;
}

// ============================================
// FILTER / SEARCH TYPES
// ============================================

/**
 * Messages filter tab identifiers.
 */
export type MessagesFilterId = 'all' | 'unread' | 'coaches' | 'teams' | 'archived';

/**
 * Messages filter tab configuration.
 */
export interface MessagesFilter {
  /** Unique filter identifier */
  readonly id: MessagesFilterId;
  /** Display label */
  readonly label: string;
  /** Icon name */
  readonly icon: string;
  /** Result count */
  readonly count?: number;
}

// ============================================
// PAGINATION / RESPONSE TYPES
// ============================================

/**
 * Pagination metadata for messages.
 */
export interface MessagesPagination {
  /** Current page */
  readonly page: number;
  /** Items per page */
  readonly limit: number;
  /** Total items */
  readonly total: number;
  /** Total pages */
  readonly totalPages: number;
  /** Whether more pages exist */
  readonly hasMore: boolean;
}

/**
 * API response for conversation list.
 */
export interface ConversationsResponse {
  /** Success status */
  readonly success: boolean;
  /** Conversation items */
  readonly conversations: readonly Conversation[];
  /** Pagination info */
  readonly pagination: MessagesPagination;
  /** Error message */
  readonly error?: string;
}

/**
 * API response for a message thread.
 */
export interface MessagesThreadResponse {
  /** Success status */
  readonly success: boolean;
  /** Conversation metadata */
  readonly conversation: Conversation;
  /** Messages in the thread */
  readonly messages: readonly Message[];
  /** Pagination info */
  readonly pagination: MessagesPagination;
  /** Error message */
  readonly error?: string;
}

/**
 * Request to send a new message.
 */
export interface SendMessageRequest {
  /** Target conversation ID */
  readonly conversationId: string;
  /** Message body text */
  readonly body: string;
  /** Attachment IDs */
  readonly attachmentIds?: readonly string[];
  /** Reply-to message ID */
  readonly replyToId?: string;
}

/**
 * Request to create a new conversation.
 */
export interface CreateConversationRequest {
  /** Conversation type */
  readonly type: ConversationType;
  /** Participant user IDs */
  readonly participantIds: readonly string[];
  /** Group name (for group/team conversations) */
  readonly title?: string;
  /** Initial message body */
  readonly initialMessage?: string;
}

// ============================================
// STATE TYPES
// ============================================

/**
 * Messages feature state.
 */
export interface MessagesState {
  /** Conversation list */
  readonly conversations: readonly Conversation[];
  /** Active filter */
  readonly activeFilter: MessagesFilterId;
  /** Search query */
  readonly searchQuery: string;
  /** Currently open conversation */
  readonly activeConversation: Conversation | null;
  /** Messages in the active thread */
  readonly threadMessages: readonly Message[];
  /** Loading states */
  readonly isLoading: boolean;
  readonly isLoadingMore: boolean;
  readonly isSending: boolean;
  /** Error */
  readonly error: string | null;
  /** Pagination */
  readonly pagination: MessagesPagination | null;
  /** Total unread count */
  readonly totalUnreadCount: number;
}
