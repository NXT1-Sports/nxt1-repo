/**
 * @fileoverview Messages Module — Barrel Export
 * @module @nxt1/core/messages
 * @version 1.0.0
 */

// Types
export type {
  MessageStatus,
  ConversationType,
  ParticipantRole,
  ConversationParticipant,
  MessageAttachment,
  Message,
  Conversation,
  MessagesFilterId,
  MessagesFilter,
  MessagesPagination,
  ConversationsResponse,
  MessagesThreadResponse,
  SendMessageRequest,
  CreateConversationRequest,
  MessagesState,
} from './messages.types';

// Constants
export {
  MESSAGES_FILTERS,
  MESSAGES_DEFAULT_FILTER,
  MESSAGES_PAGINATION_DEFAULTS,
  MESSAGES_CACHE_KEYS,
  MESSAGES_CACHE_TTL,
  MESSAGES_SEARCH_CONFIG,
  MESSAGES_EMPTY_STATES,
  MESSAGES_API_ENDPOINTS,
  MESSAGES_UI_CONFIG,
  MESSAGES_INITIAL_PAGINATION,
} from './messages.constants';

// API
export { createMessagesApi, type MessagesApi } from './messages.api';
