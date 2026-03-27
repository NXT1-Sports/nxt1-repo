/**
 * @fileoverview Notification Constants
 * @module @nxt1/core/constants
 *
 * Notification types, channels, and categories for push, email, and SMS.
 * 100% portable - no framework dependencies.
 *
 * @author NXT1 Engineering
 * @version 2.0.0
 */

// ============================================
// NOTIFICATION CHANNELS
// ============================================

export const NOTIFICATION_CHANNELS = {
  PUSH: 'push',
  EMAIL: 'email',
  SMS: 'sms',
  IN_APP: 'in-app',
} as const;

export type NotificationChannel =
  (typeof NOTIFICATION_CHANNELS)[keyof typeof NOTIFICATION_CHANNELS];

// ============================================
// NOTIFICATION CATEGORIES
// ============================================

export const NOTIFICATION_CATEGORIES = {
  // Social interactions
  SOCIAL: 'social',
  // Recruiting activities
  RECRUITING: 'recruiting',
  // Team/organization
  TEAM: 'team',
  // Content updates
  CONTENT: 'content',
  // System/account
  SYSTEM: 'system',
  // Marketing/promotional
  MARKETING: 'marketing',
  // Payments/billing
  BILLING: 'billing',
} as const;

export type NotificationCategory =
  (typeof NOTIFICATION_CATEGORIES)[keyof typeof NOTIFICATION_CATEGORIES];

// ============================================
// NOTIFICATION TYPES
// ============================================

export const NOTIFICATION_TYPES = {
  // Social interactions
  NEW_FOLLOWER: 'new_follower',
  POST_LIKE: 'post_like',
  POST_MENTION: 'post_mention',
  POST_SHARE: 'post_share',
  PROFILE_VIEW: 'profile_view',
  VIDEO_VIEW: 'video_view',

  // Recruiting
  COLLEGE_VIEW: 'college_view',
  COACH_VIEW: 'coach_view',
  NEW_OFFER: 'new_offer',
  OFFER_UPDATE: 'offer_update',
  CAMP_REMINDER: 'camp_reminder',
  VISIT_REMINDER: 'visit_reminder',
  RECRUITING_UPDATE: 'recruiting_update',
  MESSAGE_FROM_COACH: 'message_from_coach',

  // Team
  TEAM_INVITE: 'team_invite',
  TEAM_JOIN_REQUEST: 'team_join_request',
  TEAM_MEMBER_JOINED: 'team_member_joined',
  TEAM_MEMBER_LEFT: 'team_member_left',
  TEAM_ANNOUNCEMENT: 'team_announcement',
  TEAM_EVENT: 'team_event',
  TEAM_NEW_FOLLOWER: 'team_new_follower',

  // Content
  VIDEO_PROCESSED: 'video_processed',
  VIDEO_FAILED: 'video_failed',
  CARD_READY: 'card_ready',
  /** Unified Agent X action — covers task completions, briefings, welcome, etc. */
  AGENT_ACTION: 'agent_action',
  AI_NEEDS_INPUT: 'ai_needs_input',
  AI_NEEDS_APPROVAL: 'ai_needs_approval',

  // Legacy aliases (kept for backward compatibility with existing activity docs)
  /** @deprecated Use AGENT_ACTION */
  AI_TASK_COMPLETE: 'ai_task_complete',
  /** @deprecated Use AGENT_ACTION */
  AGENT_WELCOME: 'agent_welcome',

  // System
  ACCOUNT_CREATED: 'account_created',
  EMAIL_VERIFIED: 'email_verified',
  PASSWORD_CHANGED: 'password_changed',
  SECURITY_ALERT: 'security_alert',
  PROFILE_INCOMPLETE: 'profile_incomplete',

  // Billing
  PAYMENT_RECEIVED: 'payment_received',
  PAYMENT_FAILED: 'payment_failed',
  CREDITS_LOW: 'credits_low',
  CREDITS_ADDED: 'credits_added',
  BUDGET_WARNING: 'budget_warning',
  BUDGET_REACHED: 'budget_reached',

  // Marketing
  FEATURE_ANNOUNCEMENT: 'feature_announcement',
  WEEKLY_DIGEST: 'weekly_digest',
  SPECIAL_OFFER: 'special_offer',
} as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[keyof typeof NOTIFICATION_TYPES];

// ============================================
// NOTIFICATION PRIORITY
// ============================================

export const NOTIFICATION_PRIORITIES = {
  LOW: 'low',
  NORMAL: 'normal',
  HIGH: 'high',
  URGENT: 'urgent',
} as const;

export type NotificationPriority =
  (typeof NOTIFICATION_PRIORITIES)[keyof typeof NOTIFICATION_PRIORITIES];

// ============================================
// NOTIFICATION STATUS
// ============================================

export const NOTIFICATION_STATUSES = {
  PENDING: 'pending',
  SENT: 'sent',
  DELIVERED: 'delivered',
  READ: 'read',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
} as const;

export type NotificationStatus = (typeof NOTIFICATION_STATUSES)[keyof typeof NOTIFICATION_STATUSES];

// ============================================
// CATEGORY MAPPINGS
// ============================================

/**
 * Maps notification types to their category
 */
export const NOTIFICATION_TYPE_CATEGORY: Record<NotificationType, NotificationCategory> = {
  // Social
  new_follower: 'social',
  post_like: 'social',
  post_mention: 'social',
  post_share: 'social',
  profile_view: 'social',
  video_view: 'social',

  // Recruiting
  college_view: 'recruiting',
  coach_view: 'recruiting',
  new_offer: 'recruiting',
  offer_update: 'recruiting',
  camp_reminder: 'recruiting',
  visit_reminder: 'recruiting',
  recruiting_update: 'recruiting',
  message_from_coach: 'recruiting',

  // Team
  team_invite: 'team',
  team_join_request: 'team',
  team_member_joined: 'team',
  team_member_left: 'team',
  team_announcement: 'team',
  team_event: 'team',
  team_new_follower: 'team',

  // Content / Agent
  video_processed: 'content',
  video_failed: 'content',
  card_ready: 'content',
  agent_action: 'content',
  ai_needs_input: 'content',
  ai_needs_approval: 'content',
  // Legacy (still referenced in existing activity docs)
  ai_task_complete: 'content',
  agent_welcome: 'content',

  // System
  account_created: 'system',
  email_verified: 'system',
  password_changed: 'system',
  security_alert: 'system',
  profile_incomplete: 'system',

  // Billing
  payment_received: 'billing',
  payment_failed: 'billing',
  credits_low: 'billing',
  credits_added: 'billing',
  budget_warning: 'billing',
  budget_reached: 'billing',

  // Marketing
  feature_announcement: 'marketing',
  weekly_digest: 'marketing',
  special_offer: 'marketing',
};

// ============================================
// DEFAULT PREFERENCES
// ============================================

/**
 * Default notification preferences by category
 */
export const DEFAULT_NOTIFICATION_PREFERENCES: Record<
  NotificationCategory,
  {
    push: boolean;
    email: boolean;
    sms: boolean;
  }
> = {
  social: { push: true, email: false, sms: false },
  recruiting: { push: true, email: true, sms: false },
  team: { push: true, email: true, sms: false },
  content: { push: true, email: false, sms: false },
  system: { push: true, email: true, sms: false },
  billing: { push: true, email: true, sms: false },
  marketing: { push: false, email: false, sms: false },
};

// ============================================
// FIRESTORE COLLECTION NAMES
// ============================================

/**
 * Centralized Firestore collection names for the notification subsystem.
 * Every backend service and cloud function references these — never hardcode.
 */
export const NOTIFICATION_COLLECTIONS = {
  /** Global push queue — triggers onNotificationCreated Cloud Function */
  NOTIFICATIONS: 'notifications',
  /** Per-user activity feed */
  USER_ACTIVITY: 'activity',
  /** Device FCM token registry */
  FCM_TOKENS: 'FcmTokens',
  /** Per-user notification category preferences */
  NOTIFICATION_PREFERENCES: 'notification_preferences',
} as const;

// ============================================
// NOTIFICATION TYPE → ACTIVITY TAB MAPPING
// ============================================

import type { ActivityTabId } from '../activity/activity.types';

/**
 * Maps a notification type to the activity tab it should appear under.
 * Used by the backend NotificationService when writing the activity doc.
 */
export const NOTIFICATION_TYPE_TAB: Record<NotificationType, ActivityTabId> = {
  // Social → alerts
  new_follower: 'alerts',
  post_like: 'alerts',
  post_mention: 'alerts',
  post_share: 'alerts',
  profile_view: 'alerts',
  video_view: 'alerts',

  // Recruiting → alerts
  college_view: 'alerts',
  coach_view: 'alerts',
  new_offer: 'alerts',
  offer_update: 'alerts',
  camp_reminder: 'alerts',
  visit_reminder: 'alerts',
  recruiting_update: 'alerts',
  message_from_coach: 'alerts',

  // Team → alerts
  team_invite: 'alerts',
  team_join_request: 'alerts',
  team_member_joined: 'alerts',
  team_member_left: 'alerts',
  team_announcement: 'alerts',
  team_event: 'alerts',
  team_new_follower: 'alerts',

  // Content / Agent → alerts
  video_processed: 'alerts',
  video_failed: 'alerts',
  card_ready: 'alerts',
  agent_action: 'alerts',
  ai_needs_input: 'alerts',
  ai_needs_approval: 'alerts',
  // Legacy
  ai_task_complete: 'alerts',
  agent_welcome: 'alerts',

  // System → alerts
  account_created: 'alerts',
  email_verified: 'alerts',
  password_changed: 'alerts',
  security_alert: 'alerts',
  profile_incomplete: 'alerts',

  // Billing → alerts
  payment_received: 'alerts',
  payment_failed: 'alerts',
  credits_low: 'alerts',
  credits_added: 'alerts',
  budget_warning: 'alerts',
  budget_reached: 'alerts',

  // Marketing → alerts
  feature_announcement: 'alerts',
  weekly_digest: 'alerts',
  special_offer: 'alerts',
};

// ============================================
// DEFAULT DEEP LINK TEMPLATES
// ============================================

/**
 * Default deep link templates by notification type.
 *
 * These are used by `NotificationService.dispatch()` when the caller does not
 * supply a `deepLink`. Placeholders (`{userId}`, `{teamId}`, etc.) are replaced
 * at dispatch time from the `source` / `data` / `metadata` fields.
 *
 * Any notification type not listed here falls back to `/activity`.
 */
export const NOTIFICATION_DEEP_LINKS: Partial<Record<NotificationType, string>> = {
  // Social
  new_follower: '/profile/{sourceUserId}',
  post_like: '/post/{entityId}',
  post_mention: '/post/{entityId}',
  post_share: '/post/{entityId}',
  profile_view: '/analytics',
  video_view: '/analytics',

  // Recruiting
  college_view: '/analytics',
  coach_view: '/analytics',
  new_offer: '/activity?tab=inbox',
  offer_update: '/activity?tab=inbox',
  camp_reminder: '/activity?tab=inbox',
  visit_reminder: '/activity?tab=inbox',
  recruiting_update: '/activity?tab=inbox',
  message_from_coach: '/messages/{entityId}',

  // Team
  team_invite: '/activity?tab=inbox',
  team_join_request: '/manage-team',
  team_member_joined: '/manage-team',
  team_member_left: '/manage-team',
  team_announcement: '/team/{teamId}',
  team_event: '/team/{teamId}',
  team_new_follower: '/team/{teamId}',

  // Content / Agent — all route into the chat thread
  video_processed: '/agent-x?thread={sessionId}',
  video_failed: '/agent-x?thread={sessionId}',
  card_ready: '/agent-x?thread={sessionId}',
  agent_action: '/agent-x?thread={sessionId}',
  ai_needs_input: '/agent-x?thread={sessionId}',
  ai_needs_approval: '/agent-x?thread={sessionId}',
  // Legacy
  ai_task_complete: '/agent-x?thread={sessionId}',
  agent_welcome: '/agent-x',

  // System
  account_created: '/activity?tab=inbox',
  email_verified: '/activity?tab=inbox',
  password_changed: '/settings/account-information',
  security_alert: '/settings/account-information',
  profile_incomplete: '/edit-profile',

  // Billing
  payment_received: '/usage?section=payment-history',
  payment_failed: '/usage?section=payment-info',
  credits_low: '/usage?section=overview',
  credits_added: '/usage?section=overview',

  // Marketing
  feature_announcement: '/activity?tab=alerts',
  weekly_digest: '/activity?tab=alerts',
  special_offer: '/activity?tab=alerts',
} as const;

/**
 * Resolve a deep link template by replacing placeholders with actual values.
 *
 * @param type - Notification type
 * @param context - Values to substitute into the template
 * @returns Resolved deep link path, or `/activity` as fallback
 */
export function resolveDeepLink(
  type: NotificationType,
  context?: {
    sourceUserId?: string;
    entityId?: string;
    teamId?: string;
    sessionId?: string;
  }
): string {
  const template = NOTIFICATION_DEEP_LINKS[type];
  if (!template) return '/activity';

  let resolved = template;
  if (context?.sourceUserId) resolved = resolved.replace('{sourceUserId}', context.sourceUserId);
  if (context?.entityId) resolved = resolved.replace('{entityId}', context.entityId);
  if (context?.teamId) resolved = resolved.replace('{teamId}', context.teamId);
  if (context?.sessionId) resolved = resolved.replace('{sessionId}', context.sessionId);

  // If any placeholder remains unresolved, fall back to /activity
  if (resolved.includes('{')) return '/activity';

  return resolved;
}

// ============================================
// PUSH NOTIFICATION CONFIG
// ============================================

export const PUSH_CONFIG = {
  /** Maximum title length */
  MAX_TITLE_LENGTH: 65,

  /** Maximum body length */
  MAX_BODY_LENGTH: 240,

  /** Time-to-live in seconds (1 week) */
  DEFAULT_TTL: 604800,

  /** Collapse key for grouping notifications */
  COLLAPSE_KEY_PREFIX: 'nxt1_',
} as const;

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Get category for a notification type
 */
export function getNotificationCategory(type: NotificationType): NotificationCategory {
  return NOTIFICATION_TYPE_CATEGORY[type];
}

/**
 * Check if a notification type is high priority
 */
export function isHighPriorityNotification(type: NotificationType): boolean {
  const highPriorityTypes: NotificationType[] = [
    'new_offer',
    'message_from_coach',
    'security_alert',
    'payment_failed',
  ];
  return highPriorityTypes.includes(type);
}

/**
 * Get default channels for a notification type
 */
export function getDefaultChannels(type: NotificationType): NotificationChannel[] {
  const category = getNotificationCategory(type);
  const prefs = DEFAULT_NOTIFICATION_PREFERENCES[category];
  const channels: NotificationChannel[] = ['in-app'];

  if (prefs.push) channels.push('push');
  if (prefs.email) channels.push('email');
  if (prefs.sms) channels.push('sms');

  return channels;
}
