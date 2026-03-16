/**
 * @fileoverview Notification Model
 * @module @nxt1/core/models
 *
 * Type definitions for notifications (push, email, SMS, in-app).
 * 100% portable - no framework dependencies.
 *
 * Database Collections:
 * - Notifications/{userId}/items/{notificationId}  - User notifications
 * - NotificationQueue/{id}                         - Pending sends
 *
 * @author NXT1 Engineering
 * @version 2.0.0
 */

import type {
  NotificationChannel,
  NotificationCategory,
  NotificationType,
  NotificationPriority,
  NotificationStatus,
} from '../constants/notification.constants';

import {
  NOTIFICATION_TYPE_CATEGORY,
  DEFAULT_NOTIFICATION_PREFERENCES,
} from '../constants/notification.constants';

// ============================================
// SCHEMA VERSION
// ============================================

/** Current schema version for migration tracking */
export const NOTIFICATION_SCHEMA_VERSION = 1;

// ============================================
// NOTIFICATION RECIPIENT
// ============================================

export interface NotificationRecipient {
  /** User ID */
  userId: string;

  /** Display name */
  displayName?: string;

  /** Email address (for email channel) */
  email?: string;

  /** Phone number (for SMS channel) */
  phone?: string;

  /** FCM/APNs token (for push channel) */
  pushToken?: string;

  /** Device platform */
  platform?: 'ios' | 'android' | 'web';
}

// ============================================
// NOTIFICATION PAYLOAD
// ============================================

export interface NotificationPayload {
  /** Notification title */
  title: string;

  /** Notification body/message */
  body: string;

  /** URL to navigate to when clicked */
  actionUrl?: string;

  /** Deep link for mobile apps */
  deepLink?: string;

  /** Image URL */
  imageUrl?: string;

  /** Icon URL (web push) */
  iconUrl?: string;

  /** Badge count (mobile) */
  badge?: number;

  /** Sound file name */
  sound?: string;

  /** Custom data payload */
  data?: Record<string, string>;
}

// ============================================
// NOTIFICATION (Main Interface)
// ============================================

/**
 * Notification entity
 * Stored in user's notification feed
 */
export interface Notification {
  /** Unique notification ID */
  id: string;

  /** Recipient user ID */
  userId: string;

  /** Notification type */
  type: NotificationType;

  /** Category (derived from type) */
  category: NotificationCategory;

  /** Priority level */
  priority: NotificationPriority;

  /** Notification content */
  payload: NotificationPayload;

  /** Actor who triggered the notification */
  actor?: {
    userId: string;
    displayName: string;
    photoUrl?: string;
  };

  /** Related entity (post, team, college, etc.) */
  relatedEntity?: {
    type: 'post' | 'video' | 'team' | 'college' | 'user' | 'offer';
    id: string;
    name?: string;
    thumbnailUrl?: string;
  };

  /** Channels this was sent to */
  channels: NotificationChannel[];

  /** Read status */
  isRead: boolean;

  /** When read */
  readAt?: Date | string;

  /** Clicked status */
  isClicked: boolean;

  /** When clicked */
  clickedAt?: Date | string;

  /** Schema version */
  schemaVersion: number;

  /** Timestamps */
  createdAt: Date | string;
  expiresAt?: Date | string;
}

// ============================================
// NOTIFICATION QUEUE ITEM
// ============================================

/**
 * Queued notification for sending
 * Used by background workers
 */
export interface NotificationQueueItem {
  /** Queue item ID */
  id: string;

  /** Notification to send */
  notification: Omit<Notification, 'id' | 'isRead' | 'isClicked' | 'readAt' | 'clickedAt'>;

  /** Recipients */
  recipients: NotificationRecipient[];

  /** Channels to send on */
  channels: NotificationChannel[];

  /** Current status */
  status: NotificationStatus;

  /** Number of delivery attempts */
  attempts: number;

  /** Last error message */
  lastError?: string;

  /** Scheduled send time */
  scheduledAt?: Date | string;

  /** When processing started */
  processingStartedAt?: Date | string;

  /** When completed */
  completedAt?: Date | string;

  /** Timestamps */
  createdAt: Date | string;
  updatedAt: Date | string;
}

// ============================================
// USER NOTIFICATION SETTINGS
// ============================================

export interface UserNotificationSettings {
  /** User ID */
  userId: string;

  /** Push notification enabled */
  pushEnabled: boolean;

  /** Email notifications enabled */
  emailEnabled: boolean;

  /** SMS notifications enabled */
  smsEnabled: boolean;

  /** Per-category preferences */
  categoryPreferences: Record<
    NotificationCategory,
    {
      push: boolean;
      email: boolean;
      sms: boolean;
    }
  >;

  /** Quiet hours */
  quietHours?: {
    enabled: boolean;
    startHour: number; // 0-23
    endHour: number; // 0-23
    timezone: string;
  };

  /** FCM/APNs tokens */
  pushTokens: Array<{
    token: string;
    platform: 'ios' | 'android' | 'web';
    deviceId?: string;
    createdAt: Date | string;
    lastUsedAt?: Date | string;
  }>;

  /** Timestamps */
  createdAt: Date | string;
  updatedAt: Date | string;
}

// ============================================
// TYPE GUARDS
// ============================================

export function isNotificationRead(notification: Notification): boolean {
  return notification.isRead;
}

export function isNotificationExpired(notification: Notification): boolean {
  if (!notification.expiresAt) return false;
  const expiry =
    typeof notification.expiresAt === 'string'
      ? new Date(notification.expiresAt)
      : notification.expiresAt;
  return expiry < new Date();
}

export function hasActor(
  notification: Notification
): notification is Notification & { actor: NonNullable<Notification['actor']> } {
  return notification.actor !== undefined;
}

// ============================================
// FACTORY FUNCTIONS
// ============================================

export function createNotification(
  userId: string,
  type: NotificationType,
  payload: NotificationPayload,
  options: Partial<Notification> = {}
): Omit<Notification, 'id'> {
  return {
    userId,
    type,
    category: NOTIFICATION_TYPE_CATEGORY[type],
    priority: 'normal',
    payload,
    channels: ['in-app', 'push'],
    isRead: false,
    isClicked: false,
    schemaVersion: NOTIFICATION_SCHEMA_VERSION,
    createdAt: new Date().toISOString(),
    ...options,
  };
}

export function createDefaultNotificationSettings(userId: string): UserNotificationSettings {
  return {
    userId,
    pushEnabled: true,
    emailEnabled: true,
    smsEnabled: false,
    categoryPreferences: { ...DEFAULT_NOTIFICATION_PREFERENCES },
    pushTokens: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

// ============================================
// API TYPES
// ============================================

export interface GetNotificationsQuery {
  /** Filter by category */
  category?: NotificationCategory;

  /** Filter by read status */
  isRead?: boolean;

  /** Pagination cursor */
  cursor?: string;

  /** Page size */
  limit?: number;
}

export interface GetNotificationsResponse {
  notifications: Notification[];
  unreadCount: number;
  cursor?: string;
  hasMore: boolean;
}

export interface MarkNotificationsReadRequest {
  /** Notification IDs to mark as read */
  notificationIds?: string[];

  /** Mark all as read */
  markAll?: boolean;

  /** Only mark specific category */
  category?: NotificationCategory;
}

export interface RegisterPushTokenRequest {
  token: string;
  platform: 'ios' | 'android' | 'web';
  deviceId?: string;
}

export interface UpdateNotificationSettingsRequest {
  pushEnabled?: boolean;
  emailEnabled?: boolean;
  smsEnabled?: boolean;
  categoryPreferences?: Partial<
    Record<
      NotificationCategory,
      {
        push?: boolean;
        email?: boolean;
        sms?: boolean;
      }
    >
  >;
  quietHours?: {
    enabled: boolean;
    startHour: number;
    endHour: number;
    timezone: string;
  };
}

// ============================================
// DISPATCH INPUT (Backend → Unified Push Queue)
// ============================================

/**
 * Universal input for the backend's `NotificationService.dispatch()`.
 *
 * Every feature (Agent, Social, Billing, Team, etc.) calls the same
 * `dispatch()` method with this shape. The service atomically writes
 * the activity feed doc and the push queue doc in a single batch.
 *
 * 100% portable — used by backend services and Cloud Functions only,
 * but defined in @nxt1/core so the contract is shared everywhere.
 */
export interface DispatchNotificationInput {
  /** Target user ID */
  readonly userId: string;

  /** Notification type (determines category, tab, and default priority) */
  readonly type: NotificationType;

  /** Human-readable title (≤65 chars recommended) */
  readonly title: string;

  /** Body/message text (≤240 chars recommended) */
  readonly body: string;

  /** Deep link route for mobile navigation (e.g. `/activity/agent`) */
  readonly deepLink?: string;

  /** Custom data payload forwarded to FCM (all values must be strings) */
  readonly data?: Record<string, string>;

  /** Override priority (otherwise derived from type via isHighPriorityNotification) */
  readonly priority?: NotificationPriority;

  /** Activity source (who/what triggered this) */
  readonly source?: {
    readonly userName?: string;
    readonly userId?: string;
    readonly avatarUrl?: string;
    readonly teamName?: string;
  };

  /** Free-form metadata persisted on the activity doc */
  readonly metadata?: Record<string, unknown>;

  /** Media thumbnail URL (image/video preview attached to the activity) */
  readonly mediaUrl?: string;

  /** Type of attached media */
  readonly mediaType?: 'image' | 'video';

  /** Skip writing an activity feed doc (push-only, e.g. ephemeral alerts) */
  readonly skipActivity?: boolean;
}
