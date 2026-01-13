/**
 * @fileoverview Analytics Event Constants
 * @module @nxt1/core/analytics
 *
 * ⭐ THIS FILE IS 100% PORTABLE - NO PLATFORM DEPENDENCIES ⭐
 *
 * Single source of truth for all analytics event names.
 * Use these constants instead of magic strings to ensure consistency
 * across web, mobile, and any other platforms.
 *
 * @example
 * ```typescript
 * import { APP_EVENTS } from '@nxt1/core/analytics';
 *
 * analytics.trackEvent(APP_EVENTS.AUTH_SIGNED_UP, {
 *   method: 'email',
 *   referral_source: 'friend',
 * });
 * ```
 *
 * @author NXT1 Engineering
 * @version 1.0.0
 */

// ============================================
// EVENT NAME CONSTANTS
// ============================================

/**
 * All app event names - single source of truth
 * Organized by category for easy navigation
 */
export const APP_EVENTS = {
  // ============================================
  // AUTH EVENTS
  // ============================================
  AUTH_SIGNED_UP: 'auth_signed_up',
  AUTH_SIGNED_IN: 'auth_signed_in',
  AUTH_SIGNED_OUT: 'auth_signed_out',
  AUTH_PASSWORD_RESET: 'auth_password_reset',
  AUTH_EMAIL_VERIFIED: 'auth_email_verified',
  AUTH_SIGNUP_STARTED: 'auth_signup_started',
  AUTH_SIGNUP_COMPLETED: 'auth_signup_completed',
  AUTH_SIGNUP_ERROR: 'auth_signup_error',
  AUTH_SIGNIN_STARTED: 'auth_signin_started',
  AUTH_SIGNIN_COMPLETED: 'auth_signin_completed',
  AUTH_SIGNIN_ERROR: 'auth_signin_error',

  // ============================================
  // ONBOARDING EVENTS
  // ============================================
  ONBOARDING_STARTED: 'onboarding_started',
  ONBOARDING_STEP_VIEWED: 'onboarding_step_viewed',
  ONBOARDING_STEP_COMPLETED: 'onboarding_step_completed',
  ONBOARDING_ROLE_SELECTED: 'onboarding_role_selected',
  ONBOARDING_COMPLETED: 'onboarding_completed',
  ONBOARDING_SKIPPED: 'onboarding_skipped',
  ONBOARDING_ABANDONED: 'onboarding_abandoned',

  // ============================================
  // PROFILE EVENTS
  // ============================================
  PROFILE_VIEWED: 'profile_viewed',
  PROFILE_EDITED: 'profile_edited',
  PROFILE_SHARED: 'profile_shared',
  PROFILE_QR_SCANNED: 'profile_qr_scanned',
  PROFILE_SPORT_ADDED: 'profile_sport_added',
  PROFILE_SPORT_REMOVED: 'profile_sport_removed',
  PROFILE_PHOTO_UPDATED: 'profile_photo_updated',

  // ============================================
  // VIDEO EVENTS
  // ============================================
  VIDEO_VIEWED: 'video_viewed',
  VIDEO_PLAYED: 'video_played',
  VIDEO_PAUSED: 'video_paused',
  VIDEO_COMPLETED: 'video_completed',
  VIDEO_SHARED: 'video_shared',
  VIDEO_UPLOADED: 'video_uploaded',
  VIDEO_DELETED: 'video_deleted',
  VIDEO_PROGRESS: 'video_progress',

  // ============================================
  // POST EVENTS
  // ============================================
  POST_VIEWED: 'post_viewed',
  POST_CREATED: 'post_created',
  POST_EDITED: 'post_edited',
  POST_DELETED: 'post_deleted',
  POST_SHARED: 'post_shared',
  POST_REPOSTED: 'post_reposted',

  // ============================================
  // CARD/GRAPHIC EVENTS
  // ============================================
  CARD_VIEWED: 'card_viewed',
  CARD_CREATED: 'card_created',
  CARD_SHARED: 'card_shared',
  CARD_DOWNLOADED: 'card_downloaded',

  // ============================================
  // ENGAGEMENT EVENTS
  // ============================================
  USER_FOLLOWED: 'user_followed',
  USER_UNFOLLOWED: 'user_unfollowed',
  REACTION_ADDED: 'reaction_added',
  REACTION_REMOVED: 'reaction_removed',
  COMMENT_ADDED: 'comment_added',
  COMMENT_DELETED: 'comment_deleted',

  // ============================================
  // SEARCH & DISCOVERY EVENTS
  // ============================================
  SEARCH_PERFORMED: 'search_performed',
  SEARCH_RESULT_CLICKED: 'search_result_clicked',
  FILTER_APPLIED: 'filter_applied',
  EXPLORE_VIEWED: 'explore_viewed',

  // ============================================
  // COLLEGE RECRUITING EVENTS
  // ============================================
  COLLEGE_VIEWED: 'college_viewed',
  COLLEGE_SAVED: 'college_saved',
  COLLEGE_REMOVED: 'college_removed',
  OFFER_ADDED: 'offer_added',
  OFFER_REMOVED: 'offer_removed',
  COMMITMENT_ANNOUNCED: 'commitment_announced',
  QUESTIONNAIRE_STARTED: 'questionnaire_started',
  QUESTIONNAIRE_COMPLETED: 'questionnaire_completed',

  // ============================================
  // CAMPAIGN (EMAIL) EVENTS
  // ============================================
  CAMPAIGN_CREATED: 'campaign_created',
  CAMPAIGN_SENT: 'campaign_sent',
  CAMPAIGN_OPENED: 'campaign_opened',
  CAMPAIGN_CLICKED: 'campaign_clicked',
  CAMPAIGN_REPLIED: 'campaign_replied',

  // ============================================
  // TEAM CODE EVENTS
  // ============================================
  TEAM_CODE_JOINED: 'team_code_joined',
  TEAM_CODE_LEFT: 'team_code_left',
  TEAM_PAGE_VIEWED: 'team_page_viewed',

  // ============================================
  // SUBSCRIPTION EVENTS
  // ============================================
  SUBSCRIPTION_STARTED: 'subscription_started',
  SUBSCRIPTION_UPGRADED: 'subscription_upgraded',
  SUBSCRIPTION_DOWNGRADED: 'subscription_downgraded',
  SUBSCRIPTION_CANCELLED: 'subscription_cancelled',
  SUBSCRIPTION_RENEWED: 'subscription_renewed',
  CREDITS_PURCHASED: 'credits_purchased',
  CREDITS_USED: 'credits_used',

  // ============================================
  // AI FEATURE EVENTS
  // ============================================
  AI_TASK_STARTED: 'ai_task_started',
  AI_TASK_COMPLETED: 'ai_task_completed',
  AI_TASK_FAILED: 'ai_task_failed',

  // ============================================
  // NAVIGATION EVENTS
  // ============================================
  SCREEN_VIEWED: 'screen_viewed',
  TAB_CHANGED: 'tab_changed',
  MODAL_OPENED: 'modal_opened',
  MODAL_CLOSED: 'modal_closed',
  NAVIGATION_ERROR: 'navigation_error',

  // ============================================
  // ERROR EVENTS
  // ============================================
  ERROR_OCCURRED: 'error_occurred',
  ERROR_BOUNDARY_HIT: 'error_boundary_hit',
  API_ERROR: 'api_error',

  // ============================================
  // APP LIFECYCLE EVENTS
  // ============================================
  APP_OPENED: 'app_opened',
  APP_BACKGROUNDED: 'app_backgrounded',
  APP_FOREGROUNDED: 'app_foregrounded',
  SESSION_STARTED: 'session_started',
  SESSION_ENDED: 'session_ended',
  APP_UPDATED: 'app_updated',
} as const;

/**
 * Type for any valid event name
 */
export type AppEventName = (typeof APP_EVENTS)[keyof typeof APP_EVENTS];

// ============================================
// EVENT CATEGORIES
// ============================================

/**
 * Event categories for organization and filtering
 */
export const EVENT_CATEGORIES = {
  AUTH: 'auth',
  ONBOARDING: 'onboarding',
  PROFILE: 'profile',
  VIDEO: 'video',
  POST: 'post',
  CARD: 'card',
  ENGAGEMENT: 'engagement',
  SEARCH: 'search',
  RECRUITING: 'recruiting',
  CAMPAIGN: 'campaign',
  TEAM: 'team',
  SUBSCRIPTION: 'subscription',
  AI: 'ai',
  NAVIGATION: 'navigation',
  ERROR: 'error',
  LIFECYCLE: 'lifecycle',
} as const;

export type EventCategory = (typeof EVENT_CATEGORIES)[keyof typeof EVENT_CATEGORIES];

// ============================================
// COMMON TYPES
// ============================================

/** Traffic source for attribution */
export type TrafficSource =
  | 'direct'
  | 'search'
  | 'social'
  | 'campaign'
  | 'referral'
  | 'qr_code'
  | 'team_page'
  | 'rankings'
  | 'email'
  | 'push'
  | 'unknown';

/** Viewer/user type for segmentation */
export type ViewerType =
  | 'athlete'
  | 'coach'
  | 'college_coach'
  | 'parent'
  | 'scout'
  | 'media'
  | 'fan'
  | 'service'
  | 'anonymous';

/** Device type */
export type DeviceType = 'web' | 'ios' | 'android' | 'tablet' | 'unknown';

/** Content type */
export type ContentType = 'video' | 'post' | 'card' | 'profile' | 'mixtape' | 'highlight';

/** Auth method */
export type AuthMethod = 'email' | 'google' | 'apple' | 'facebook';

/** Subscription plan type */
export type PlanType = 'free' | 'starter' | 'pro' | 'elite' | 'team';

// ============================================
// BASE EVENT PROPERTIES
// ============================================

/**
 * Base properties included in every event
 */
export interface BaseEventProperties {
  /** Timestamp when event occurred (ISO string) */
  timestamp?: string;
  /** User ID if authenticated */
  user_id?: string;
  /** Session ID for grouping events */
  session_id?: string;
  /** Device type */
  device?: DeviceType;
  /** App version */
  app_version?: string;
  /** Platform (web/ios/android) */
  platform?: 'web' | 'ios' | 'android';
  /** Event category */
  category?: EventCategory;
  /** Custom properties */
  [key: string]: unknown;
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Get event category from event name
 * @param eventName - Event name
 * @returns Event category
 */
export function getEventCategory(eventName: AppEventName | string): EventCategory {
  if (eventName.startsWith('auth_')) return EVENT_CATEGORIES.AUTH;
  if (eventName.startsWith('onboarding_')) return EVENT_CATEGORIES.ONBOARDING;
  if (eventName.startsWith('profile_')) return EVENT_CATEGORIES.PROFILE;
  if (eventName.startsWith('video_')) return EVENT_CATEGORIES.VIDEO;
  if (eventName.startsWith('post_')) return EVENT_CATEGORIES.POST;
  if (eventName.startsWith('card_')) return EVENT_CATEGORIES.CARD;
  if (
    eventName.startsWith('user_') ||
    eventName.startsWith('reaction_') ||
    eventName.startsWith('comment_')
  ) {
    return EVENT_CATEGORIES.ENGAGEMENT;
  }
  if (
    eventName.startsWith('search_') ||
    eventName.startsWith('filter_') ||
    eventName.startsWith('explore_')
  ) {
    return EVENT_CATEGORIES.SEARCH;
  }
  if (
    eventName.startsWith('college_') ||
    eventName.startsWith('offer_') ||
    eventName.startsWith('commitment_') ||
    eventName.startsWith('questionnaire_')
  ) {
    return EVENT_CATEGORIES.RECRUITING;
  }
  if (eventName.startsWith('campaign_')) return EVENT_CATEGORIES.CAMPAIGN;
  if (eventName.startsWith('team_')) return EVENT_CATEGORIES.TEAM;
  if (eventName.startsWith('subscription_') || eventName.startsWith('credits_'))
    return EVENT_CATEGORIES.SUBSCRIPTION;
  if (eventName.startsWith('ai_')) return EVENT_CATEGORIES.AI;
  if (
    eventName.startsWith('screen_') ||
    eventName.startsWith('tab_') ||
    eventName.startsWith('modal_') ||
    eventName.startsWith('navigation_')
  ) {
    return EVENT_CATEGORIES.NAVIGATION;
  }
  if (eventName.startsWith('error_') || eventName.startsWith('api_error'))
    return EVENT_CATEGORIES.ERROR;
  if (eventName.startsWith('app_') || eventName.startsWith('session_'))
    return EVENT_CATEGORIES.LIFECYCLE;

  return EVENT_CATEGORIES.LIFECYCLE;
}
