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
  POST_COMMENT: 'post_comment',
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

  // Content
  VIDEO_PROCESSED: 'video_processed',
  VIDEO_FAILED: 'video_failed',
  CARD_READY: 'card_ready',
  AI_TASK_COMPLETE: 'ai_task_complete',

  // System
  ACCOUNT_CREATED: 'account_created',
  EMAIL_VERIFIED: 'email_verified',
  PASSWORD_CHANGED: 'password_changed',
  SECURITY_ALERT: 'security_alert',
  PROFILE_INCOMPLETE: 'profile_incomplete',

  // Billing
  SUBSCRIPTION_STARTED: 'subscription_started',
  SUBSCRIPTION_RENEWED: 'subscription_renewed',
  SUBSCRIPTION_CANCELLED: 'subscription_cancelled',
  SUBSCRIPTION_EXPIRING: 'subscription_expiring',
  PAYMENT_RECEIVED: 'payment_received',
  PAYMENT_FAILED: 'payment_failed',
  CREDITS_LOW: 'credits_low',
  CREDITS_ADDED: 'credits_added',

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
  post_comment: 'social',
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

  // Content
  video_processed: 'content',
  video_failed: 'content',
  card_ready: 'content',
  ai_task_complete: 'content',

  // System
  account_created: 'system',
  email_verified: 'system',
  password_changed: 'system',
  security_alert: 'system',
  profile_incomplete: 'system',

  // Billing
  subscription_started: 'billing',
  subscription_renewed: 'billing',
  subscription_cancelled: 'billing',
  subscription_expiring: 'billing',
  payment_received: 'billing',
  payment_failed: 'billing',
  credits_low: 'billing',
  credits_added: 'billing',

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
    'subscription_expiring',
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
