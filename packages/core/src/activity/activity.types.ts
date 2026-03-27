/**
 * @fileoverview Activity Type Definitions
 * @module @nxt1/core/activity
 * @version 1.0.0
 *
 * Pure TypeScript type definitions for Activity/Notifications feature.
 * 100% portable - works on web, mobile, and backend.
 */

// ============================================
// ACTIVITY TAB TYPES
// ============================================

/**
 * Activity tab identifier.
 * Currently only 'alerts' is used — a single unified notifications feed.
 */
export type ActivityTabId = 'alerts';

/**
 * Configuration for an activity tab.
 */
export interface ActivityTab {
  /** Unique tab identifier */
  readonly id: ActivityTabId;
  /** Display label */
  readonly label: string;
  /** Ionicons icon name */
  readonly icon: string;
  /** Badge count (unread items) */
  readonly badge?: number;
  /** Whether tab is currently disabled */
  readonly disabled?: boolean;
}

// ============================================
// ACTIVITY ITEM TYPES
// ============================================

/**
 * Type of activity/notification.
 * Determines styling and behavior.
 */
export type ActivityType =
  | 'like'
  | 'mention'
  | 'announcement'
  | 'milestone'
  | 'reminder'
  | 'system'
  | 'update'
  | 'agent_task';

/**
 * Priority level for activity items.
 */
export type ActivityPriority = 'low' | 'normal' | 'high' | 'urgent';

/**
 * Source/origin of the activity.
 */
export interface ActivitySource {
  /** Source user ID (if from a user) */
  readonly userId?: string;
  /** Source user name */
  readonly userName?: string;
  /** Source avatar URL */
  readonly avatarUrl?: string;
  /** Source team ID (if from a team) */
  readonly teamId?: string;
  /** Source team name */
  readonly teamName?: string;
  /** Source team logo URL */
  readonly teamLogoUrl?: string;
  /** Source college ID (if from a college) */
  readonly collegeId?: string;
  /** Source college name */
  readonly collegeName?: string;
}

/**
 * Action that can be performed on an activity item.
 */
export interface ActivityAction {
  /** Unique action identifier */
  readonly id: string;
  /** Display label */
  readonly label: string;
  /** Button variant/style */
  readonly variant?: 'primary' | 'secondary' | 'outline' | 'text';
  /** Icon name */
  readonly icon?: string;
  /** Deep link or route */
  readonly route?: string;
  /** External URL */
  readonly url?: string;
}

/**
 * A single activity/notification item.
 */
export interface ActivityItem {
  /** Unique identifier */
  readonly id: string;
  /** Activity type (determines icon/styling) */
  readonly type: ActivityType;
  /** Which tab(s) this belongs to */
  readonly tab: ActivityTabId;
  /** Activity priority */
  readonly priority: ActivityPriority;
  /** Activity title/headline */
  readonly title: string;
  /** Activity body/preview text */
  readonly body?: string;
  /** When this activity occurred */
  readonly timestamp: string;
  /** Whether user has read this */
  readonly isRead: boolean;
  /** Whether this has been archived */
  readonly isArchived?: boolean;
  /** Source/origin of activity */
  readonly source?: ActivitySource;
  /** Primary action (if any) */
  readonly action?: ActivityAction;
  /** Secondary actions */
  readonly secondaryActions?: readonly ActivityAction[];
  /** Deep link to navigate to */
  readonly deepLink?: string;
  /** Expiration time (for deals/offers) */
  readonly expiresAt?: string;
  /** Media thumbnail URL (image/video preview attached to this activity) */
  readonly mediaUrl?: string;
  /** Type of attached media */
  readonly mediaType?: 'image' | 'video';
  /** Metadata for extended info */
  readonly metadata?: Record<string, unknown>;
}

// ============================================
// ACTIVITY FILTER TYPES
// ============================================

/**
 * Filter parameters for fetching activities.
 */
export interface ActivityFilter {
  /** Filter by tab */
  readonly tab?: ActivityTabId;
  /** Filter by activity type(s) */
  readonly types?: readonly ActivityType[];
  /** Filter by read status */
  readonly isRead?: boolean;
  /** Filter by priority */
  readonly priority?: ActivityPriority;
  /** Filter by date range start */
  readonly since?: string;
  /** Filter by date range end */
  readonly until?: string;
  /** Pagination: page number (1-based) */
  readonly page?: number;
  /** Pagination: items per page */
  readonly limit?: number;
  /** Sort order */
  readonly sortBy?: 'timestamp' | 'priority';
  /** Sort direction */
  readonly sortOrder?: 'asc' | 'desc';
}

// ============================================
// API RESPONSE TYPES
// ============================================

/**
 * Pagination info returned from API.
 */
export interface ActivityPagination {
  /** Current page number */
  readonly page: number;
  /** Items per page */
  readonly limit: number;
  /** Total items across all pages */
  readonly total: number;
  /** Total number of pages */
  readonly totalPages: number;
  /** Whether there are more pages */
  readonly hasMore: boolean;
}

/**
 * Response from activity feed endpoint.
 */
export interface ActivityFeedResponse {
  /** Whether request was successful */
  readonly success: boolean;
  /** Activity items */
  readonly items?: readonly ActivityItem[];
  /** Pagination info */
  readonly pagination?: ActivityPagination;
  /** Badge counts per tab */
  readonly badges?: Record<ActivityTabId, number>;
  /** Error message if failed */
  readonly error?: string;
  /** Error code for programmatic handling */
  readonly errorCode?: string;
}

/**
 * Response from mark read endpoint.
 */
export interface ActivityMarkReadResponse {
  /** Whether request was successful */
  readonly success: boolean;
  /** Number of items marked read */
  readonly count?: number;
  /** Updated badge counts */
  readonly badges?: Record<ActivityTabId, number>;
  /** Error message if failed */
  readonly error?: string;
}

/**
 * Summary of activity counts.
 */
export interface ActivitySummary {
  /** Total unread count */
  readonly totalUnread: number;
  /** Badge counts per tab */
  readonly badges: Record<ActivityTabId, number>;
  /** Last activity timestamp */
  readonly lastActivity?: string;
}

// ============================================
// SERVICE STATE TYPES
// ============================================

/**
 * UI state for activity service.
 */
export interface ActivityState {
  /** Current items in feed */
  readonly items: readonly ActivityItem[];
  /** Currently selected tab */
  readonly activeTab: ActivityTabId;
  /** Badge counts per tab */
  readonly badges: Record<ActivityTabId, number>;
  /** Whether initial load is in progress */
  readonly isLoading: boolean;
  /** Whether loading more items */
  readonly isLoadingMore: boolean;
  /** Whether refreshing */
  readonly isRefreshing: boolean;
  /** Current error message */
  readonly error: string | null;
  /** Current pagination */
  readonly pagination: ActivityPagination | null;
}

// ============================================
// AGENT TASK ACTIVITY
// ============================================

/**
 * Metadata attached to an agent_task activity item.
 * Provides the routing context needed for deep-linking
 * from push notifications and the activity feed into
 * the exact Agent X chat thread where the task completed.
 */
export interface AgentTaskActivityMetadata {
  /** Agent job session ID used for queue tracking and notification correlation */
  readonly sessionId: string;
  /** Persisted Agent X chat thread ID used by /agent-x/threads/:threadId/messages */
  readonly threadId?: string;
  /** The backend operation ID tracking this job */
  readonly operationId: string;
  /** Which sub-agent handled the task */
  readonly agentId?: string;
  /** Human-readable summary of what Agent X did */
  readonly resultSummary?: string;
  /** Optional context entity (e.g., a generated video or graphic ID) */
  readonly contextId?: string;
  /** The Agent X mode the task ran under */
  readonly mode?: string;
  /** Optional rendered image output attached to the completed task */
  readonly imageUrl?: string;
  /** Optional rendered video output attached to the completed task */
  readonly videoUrl?: string;
}
