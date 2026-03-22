/**
 * @fileoverview Activity Module - Barrel Export
 * @module @nxt1/core/activity
 * @version 1.0.0
 */

// Types
export type {
  ActivityTabId,
  ActivityTab,
  ActivityType,
  ActivityPriority,
  ActivitySource,
  ActivityAction,
  ActivityItem,
  ActivityFilter,
  ActivityPagination,
  ActivityFeedResponse,
  ActivityMarkReadResponse,
  ActivitySummary,
  ActivityState,
  AgentTaskActivityMetadata,
} from './activity.types';

// Constants
export {
  ACTIVITY_TABS,
  ACTIVITY_TABS_ALERTS_ONLY,
  ACTIVITY_DEFAULT_TAB,
  ACTIVITY_TYPE_ICONS,
  ACTIVITY_TYPE_COLORS,
  ACTIVITY_PRIORITY_WEIGHTS,
  ACTIVITY_PAGINATION_DEFAULTS,
  ACTIVITY_CACHE_KEYS,
  ACTIVITY_CACHE_TTL,
  ACTIVITY_EMPTY_STATES,
  ACTIVITY_API_ENDPOINTS,
  ACTIVITY_UI_CONFIG,
  INBOX_EMAIL_PROVIDERS,
  type InboxEmailProvider,
} from './activity.constants';

// Mapper (Conversation → ActivityItem)
export {
  conversationToActivityItem,
  conversationsToActivityItems,
  type MessageActivityMetadata,
} from './conversation-mapper';

// API
export { createActivityApi, type ActivityApi } from './activity.api';
