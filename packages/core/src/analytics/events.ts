/**
 * @fileoverview Analytics Event Constants
 * @module @nxt1/core/analytics
 *
 * ⭐ THIS FILE IS 100% PORTABLE - NO PLATFORM DEPENDENCIES ⭐
 *
 * Single source of truth for all analytics event names.
 * Uses Firebase/GA4 recommended events where available for:
 * - Pre-built GA4 dashboards and reports
 * - Better BigQuery schema compatibility
 * - Cross-platform consistency with mobile SDKs
 * - Predictive audiences and ML features
 *
 * @see https://developers.google.com/analytics/devguides/collection/ga4/reference/events
 * @see https://support.google.com/analytics/answer/9267735 (User Properties)
 *
 * @example
 * ```typescript
 * import { FIREBASE_EVENTS, APP_EVENTS, USER_PROPERTIES } from '@nxt1/core/analytics';
 *
 * // Use Firebase recommended events
 * analytics.trackEvent(FIREBASE_EVENTS.SIGN_UP, { method: 'email' });
 * analytics.trackEvent(FIREBASE_EVENTS.LOGIN, { method: 'google' });
 * analytics.trackEvent(FIREBASE_EVENTS.PURCHASE, {
 *   transaction_id: 'T_12345',
 *   value: 9.99,
 *   currency: 'USD',
 * });
 *
 * // Use custom NXT1 events
 * analytics.trackEvent(APP_EVENTS.PROFILE_VIEWED, { profile_id: '123' });
 *
 * // Set user properties
 * analytics.setUserProperties({
 *   [USER_PROPERTIES.USER_TYPE]: 'athlete',
 *   [USER_PROPERTIES.SUBSCRIPTION_TIER]: 'pro',
 * });
 * ```
 *
 * @author NXT1 Engineering
 * @version 2.0.0
 */

// ============================================
// FIREBASE/GA4 RECOMMENDED EVENTS
// ============================================
// These are standard events recognized by GA4 with pre-built reports
// Always prefer these over custom events when the use case matches

/**
 * Firebase/GA4 Recommended Events
 * @see https://developers.google.com/analytics/devguides/collection/ga4/reference/events
 */
export const FIREBASE_EVENTS = {
  // ============================================
  // AUTH EVENTS (Recommended)
  // ============================================
  /** User signed up for an account */
  SIGN_UP: 'sign_up',
  /** User logged in */
  LOGIN: 'login',

  // ============================================
  // ENGAGEMENT EVENTS (Recommended)
  // ============================================
  /** User shared content */
  SHARE: 'share',
  /** User searched */
  SEARCH: 'search',
  /** User selected content */
  SELECT_CONTENT: 'select_content',
  /** User joined a group/team */
  JOIN_GROUP: 'join_group',

  // ============================================
  // ONBOARDING EVENTS (Recommended)
  // ============================================
  /** User started tutorial/onboarding */
  TUTORIAL_BEGIN: 'tutorial_begin',
  /** User completed tutorial/onboarding */
  TUTORIAL_COMPLETE: 'tutorial_complete',

  // ============================================
  // ECOMMERCE EVENTS (Recommended)
  // ============================================
  /** User viewed an item */
  VIEW_ITEM: 'view_item',
  /** User viewed a list of items */
  VIEW_ITEM_LIST: 'view_item_list',
  /** User selected an item from a list */
  SELECT_ITEM: 'select_item',
  /** User added item to cart */
  ADD_TO_CART: 'add_to_cart',
  /** User removed item from cart */
  REMOVE_FROM_CART: 'remove_from_cart',
  /** User viewed cart */
  VIEW_CART: 'view_cart',
  /** User started checkout */
  BEGIN_CHECKOUT: 'begin_checkout',
  /** User added payment info */
  ADD_PAYMENT_INFO: 'add_payment_info',
  /** User completed purchase */
  PURCHASE: 'purchase',
  /** Refund processed */
  REFUND: 'refund',

  // ============================================
  // PROMOTION EVENTS (Recommended)
  // ============================================
  /** User viewed a promotion */
  VIEW_PROMOTION: 'view_promotion',
  /** User selected/clicked a promotion */
  SELECT_PROMOTION: 'select_promotion',

  // ============================================
  // LEAD EVENTS (Recommended)
  // ============================================
  /** Lead generated (form submission, etc.) */
  GENERATE_LEAD: 'generate_lead',

  // ============================================
  // NAVIGATION EVENTS (Automatic but can be manual)
  // ============================================
  /** Page/screen view */
  PAGE_VIEW: 'page_view',
  /** Screen view (mobile) */
  SCREEN_VIEW: 'screen_view',

  // ============================================
  // ERROR EVENTS (Recommended)
  // ============================================
  /** Exception/error occurred */
  EXCEPTION: 'exception',
} as const;

export type FirebaseEventName = (typeof FIREBASE_EVENTS)[keyof typeof FIREBASE_EVENTS];

// ============================================
// FIREBASE EVENT PARAMETER TYPES
// ============================================
// Properly typed parameters for Firebase recommended events

/**
 * Parameters for sign_up event
 */
export interface SignUpEventParams {
  /** Sign-up method: 'email', 'google', 'apple', 'facebook' */
  method: string;
}

/**
 * Parameters for login event
 */
export interface LoginEventParams {
  /** Login method: 'email', 'google', 'apple', 'facebook' */
  method: string;
}

/**
 * Parameters for share event
 */
export interface ShareEventParams {
  /** Share method: 'twitter', 'facebook', 'copy_link', 'sms', etc. */
  method?: string;
  /** Type of content shared: 'profile', 'video', 'post', 'card' */
  content_type?: string;
  /** ID of the shared content */
  item_id?: string;
}

/**
 * Parameters for search event
 */
export interface SearchEventParams {
  /** The search query */
  search_term: string;
}

/**
 * Parameters for select_content event
 */
export interface SelectContentEventParams {
  /** Type of content: 'video', 'profile', 'post', 'card' */
  content_type?: string;
  /** ID of the content */
  content_id?: string;
}

/**
 * Parameters for join_group event
 */
export interface JoinGroupEventParams {
  /** ID of the group/team joined */
  group_id: string;
}

/**
 * Item structure for eCommerce events
 */
export interface AnalyticsItem {
  /** Item ID (required) */
  item_id: string;
  /** Item name (required) */
  item_name: string;
  /** Item brand */
  item_brand?: string;
  /** Item category */
  item_category?: string;
  /** Secondary category */
  item_category2?: string;
  /** Item variant */
  item_variant?: string;
  /** Item price */
  price?: number;
  /** Item quantity */
  quantity?: number;
  /** Coupon code */
  coupon?: string;
  /** Item index in list */
  index?: number;
  /** Discount amount */
  discount?: number;
}

/**
 * Parameters for purchase event
 */
export interface PurchaseEventParams {
  /** Unique transaction ID (required) */
  transaction_id: string;
  /** Total value (required for revenue) */
  value: number;
  /** Currency code: 'USD', 'EUR', etc. (required with value) */
  currency: string;
  /** Tax amount */
  tax?: number;
  /** Shipping cost */
  shipping?: number;
  /** Coupon code */
  coupon?: string;
  /** Items purchased */
  items?: AnalyticsItem[];
}

/**
 * Parameters for begin_checkout event
 */
export interface BeginCheckoutEventParams {
  /** Total value */
  value?: number;
  /** Currency code */
  currency?: string;
  /** Coupon code */
  coupon?: string;
  /** Items in checkout */
  items?: AnalyticsItem[];
}

/**
 * Parameters for generate_lead event
 */
export interface GenerateLeadEventParams {
  /** Lead value */
  value?: number;
  /** Currency code */
  currency?: string;
  /** Source of the lead */
  lead_source?: string;
}

/**
 * Parameters for view_item event
 */
export interface ViewItemEventParams {
  /** Currency code */
  currency?: string;
  /** Item value */
  value?: number;
  /** Items viewed */
  items: AnalyticsItem[];
}

/**
 * Parameters for exception event
 */
export interface ExceptionEventParams {
  /** Error description (max 150 chars) */
  description: string;
  /** Whether the error was fatal */
  fatal?: boolean;
}

// ============================================
// CUSTOM NXT1 APP EVENTS
// ============================================
// These are NXT1-specific events not covered by Firebase recommended events

/**
 * Custom NXT1 App Events
 * Use these for platform-specific tracking not covered by Firebase events
 */
export const APP_EVENTS = {
  // ============================================
  // AUTH EVENTS (Extended - beyond sign_up/login)
  // ============================================
  /** User signed out */
  AUTH_SIGNED_OUT: 'auth_signed_out',
  /** User signed in (alternative to FIREBASE_EVENTS.LOGIN) */
  AUTH_SIGNED_IN: 'auth_signed_in',
  /** User signed up (alternative to FIREBASE_EVENTS.SIGN_UP) */
  AUTH_SIGNED_UP: 'auth_signed_up',
  /** Password reset requested */
  AUTH_PASSWORD_RESET: 'auth_password_reset',
  /** Verification email sent */
  AUTH_VERIFICATION_EMAIL_SENT: 'auth_verification_email_sent',
  /** Email verified */
  AUTH_EMAIL_VERIFIED: 'auth_email_verified',
  /** Sign-up flow started (before completion) */
  AUTH_SIGNUP_STARTED: 'auth_signup_started',
  /** Sign-up error occurred */
  AUTH_SIGNUP_ERROR: 'auth_signup_error',
  /** Sign-in error occurred */
  AUTH_SIGNIN_ERROR: 'auth_signin_error',

  // ============================================
  // ONBOARDING EVENTS (Extended - beyond tutorial_begin/complete)
  // ============================================
  /** Onboarding flow started */
  ONBOARDING_STARTED: 'onboarding_started',
  /** Onboarding flow completed */
  ONBOARDING_COMPLETED: 'onboarding_completed',
  /** Specific onboarding step viewed */
  ONBOARDING_STEP_VIEWED: 'onboarding_step_viewed',
  /** Specific onboarding step completed */
  ONBOARDING_STEP_COMPLETED: 'onboarding_step_completed',
  /** User selected their role during onboarding */
  ONBOARDING_ROLE_SELECTED: 'onboarding_role_selected',
  /** User submitted referral source (how they heard about NXT1) */
  ONBOARDING_REFERRAL_SUBMITTED: 'onboarding_referral_submitted',
  /** User skipped onboarding */
  ONBOARDING_SKIPPED: 'onboarding_skipped',
  /** User abandoned onboarding */
  ONBOARDING_ABANDONED: 'onboarding_abandoned',

  // ============================================
  // PROFILE EVENTS
  // ============================================
  /** Profile page viewed */
  PROFILE_VIEWED: 'profile_viewed',
  /** Profile edited */
  PROFILE_EDITED: 'profile_edited',
  /** Profile shared (use FIREBASE_EVENTS.SHARE for tracking) */
  PROFILE_SHARED: 'profile_shared',
  /** QR code scanned to view profile */
  PROFILE_QR_SCANNED: 'profile_qr_scanned',
  /** Sport added to profile */
  PROFILE_SPORT_ADDED: 'profile_sport_added',
  /** Sport removed from profile */
  PROFILE_SPORT_REMOVED: 'profile_sport_removed',
  /** Profile photo updated */
  PROFILE_PHOTO_UPDATED: 'profile_photo_updated',
  /** Profile tab changed (overview, timeline, stats, etc.) */
  PROFILE_TAB_CHANGED: 'profile_tab_changed',

  // ============================================
  // VIDEO EVENTS
  // ============================================
  /** Video viewed (impressions) */
  VIDEO_VIEWED: 'video_viewed',
  /** Video playback started */
  VIDEO_PLAYED: 'video_played',
  /** Video paused */
  VIDEO_PAUSED: 'video_paused',
  /** Video watched to completion */
  VIDEO_COMPLETED: 'video_completed',
  /** Video shared */
  VIDEO_SHARED: 'video_shared',
  /** Video uploaded */
  VIDEO_UPLOADED: 'video_uploaded',
  /** Video deleted */
  VIDEO_DELETED: 'video_deleted',
  /** Video progress milestone (25%, 50%, 75%) */
  VIDEO_PROGRESS: 'video_progress',

  // ============================================
  // POST EVENTS
  // ============================================
  /** Post viewed */
  POST_VIEWED: 'post_viewed',
  /** Post created */
  POST_CREATED: 'post_created',
  /** Post edited */
  POST_EDITED: 'post_edited',
  /** Post deleted */
  POST_DELETED: 'post_deleted',
  /** Post shared */
  POST_SHARED: 'post_shared',
  /** Post reposted */
  POST_REPOSTED: 'post_reposted',

  // ============================================
  // CARD/GRAPHIC EVENTS
  // ============================================
  /** Card viewed */
  CARD_VIEWED: 'card_viewed',
  /** Card created */
  CARD_CREATED: 'card_created',
  /** Card shared */
  CARD_SHARED: 'card_shared',
  /** Card downloaded */
  CARD_DOWNLOADED: 'card_downloaded',

  // ============================================
  // ENGAGEMENT EVENTS
  // ============================================
  /** User followed another user */
  USER_FOLLOWED: 'user_followed',
  /** User unfollowed another user */
  USER_UNFOLLOWED: 'user_unfollowed',
  /** Reaction added (like, etc.) */
  REACTION_ADDED: 'reaction_added',
  /** Reaction removed */
  REACTION_REMOVED: 'reaction_removed',
  /** Comment added */
  COMMENT_ADDED: 'comment_added',
  /** Comment deleted */
  COMMENT_DELETED: 'comment_deleted',

  // ============================================
  // SEARCH & DISCOVERY EVENTS (Extended)
  // ============================================
  /** Search result clicked */
  SEARCH_RESULT_CLICKED: 'search_result_clicked',
  /** Filter applied to search/list */
  FILTER_APPLIED: 'filter_applied',
  /** Explore page viewed */
  EXPLORE_VIEWED: 'explore_viewed',

  // ============================================
  // COLLEGE RECRUITING EVENTS
  // ============================================
  /** College profile viewed */
  COLLEGE_VIEWED: 'college_viewed',
  /** College saved to list */
  COLLEGE_SAVED: 'college_saved',
  /** College removed from list */
  COLLEGE_REMOVED: 'college_removed',
  /** Offer added */
  OFFER_ADDED: 'offer_added',
  /** Offer removed */
  OFFER_REMOVED: 'offer_removed',
  /** Commitment announced */
  COMMITMENT_ANNOUNCED: 'commitment_announced',
  /** Recruiting questionnaire started */
  QUESTIONNAIRE_STARTED: 'questionnaire_started',
  /** Recruiting questionnaire completed */
  QUESTIONNAIRE_COMPLETED: 'questionnaire_completed',

  // ============================================
  // CAMPAIGN (EMAIL) EVENTS
  // ============================================
  /** Email campaign created */
  CAMPAIGN_CREATED: 'campaign_created',
  /** Email campaign sent */
  CAMPAIGN_SENT: 'campaign_sent',
  /** Email campaign opened */
  CAMPAIGN_OPENED: 'campaign_opened',
  /** Email campaign link clicked */
  CAMPAIGN_CLICKED: 'campaign_clicked',
  /** Email campaign replied */
  CAMPAIGN_REPLIED: 'campaign_replied',

  // ============================================
  // TEAM CODE EVENTS
  // ============================================
  /** User joined via team code */
  TEAM_CODE_JOINED: 'team_code_joined',
  /** User left team */
  TEAM_CODE_LEFT: 'team_code_left',
  /** Team page viewed */
  TEAM_PAGE_VIEWED: 'team_page_viewed',

  // ============================================
  // SUBSCRIPTION EVENTS (Extended - beyond purchase)
  // ============================================
  /** Subscription started (initial purchase) */
  SUBSCRIPTION_STARTED: 'subscription_started',
  /** Subscription upgraded */
  SUBSCRIPTION_UPGRADED: 'subscription_upgraded',
  /** Subscription downgraded */
  SUBSCRIPTION_DOWNGRADED: 'subscription_downgraded',
  /** Subscription cancelled */
  SUBSCRIPTION_CANCELLED: 'subscription_cancelled',
  /** Subscription renewed */
  SUBSCRIPTION_RENEWED: 'subscription_renewed',
  /** Credits purchased (in-app purchase) */
  CREDITS_PURCHASED: 'credits_purchased',
  /** Credits used */
  CREDITS_USED: 'credits_used',

  // ============================================
  // AI FEATURE EVENTS
  // ============================================
  /** AI task started */
  AI_TASK_STARTED: 'ai_task_started',
  /** AI task completed */
  AI_TASK_COMPLETED: 'ai_task_completed',
  /** AI task failed */
  AI_TASK_FAILED: 'ai_task_failed',

  // ============================================
  // AGENT ONBOARDING EVENTS
  // ============================================
  /** Agent onboarding started */
  AGENT_ONBOARDING_STARTED: 'agent_onboarding_started',
  /** Agent onboarding step viewed */
  AGENT_ONBOARDING_STEP_VIEWED: 'agent_onboarding_step_viewed',
  /** Agent onboarding step completed */
  AGENT_ONBOARDING_STEP_COMPLETED: 'agent_onboarding_step_completed',
  /** Program searched during onboarding */
  AGENT_ONBOARDING_PROGRAM_SEARCHED: 'agent_onboarding_program_searched',
  /** Program selected/claimed during onboarding */
  AGENT_ONBOARDING_PROGRAM_SELECTED: 'agent_onboarding_program_selected',
  /** New program created during onboarding */
  AGENT_ONBOARDING_PROGRAM_CREATED: 'agent_onboarding_program_created',
  /** Goal selected during onboarding */
  AGENT_ONBOARDING_GOAL_SELECTED: 'agent_onboarding_goal_selected',
  /** Connection added during onboarding */
  AGENT_ONBOARDING_CONNECTION_ADDED: 'agent_onboarding_connection_added',
  /** Agent onboarding completed */
  AGENT_ONBOARDING_COMPLETED: 'agent_onboarding_completed',
  /** Agent onboarding skipped */
  AGENT_ONBOARDING_SKIPPED: 'agent_onboarding_skipped',

  // ============================================
  // NAVIGATION EVENTS
  // ============================================
  /** Screen viewed (for custom tracking) */
  SCREEN_VIEWED: 'screen_viewed',
  /** Tab changed */
  TAB_CHANGED: 'tab_changed',
  /** Modal opened */
  MODAL_OPENED: 'modal_opened',
  /** Modal closed */
  MODAL_CLOSED: 'modal_closed',
  /** Navigation error */
  NAVIGATION_ERROR: 'navigation_error',

  // ============================================
  // ERROR EVENTS
  // ============================================
  /** Custom error occurred */
  ERROR_OCCURRED: 'error_occurred',
  /** Error boundary triggered */
  ERROR_BOUNDARY_HIT: 'error_boundary_hit',
  /** API error occurred */
  API_ERROR: 'api_error',

  // ============================================
  // APP LIFECYCLE EVENTS
  // ============================================
  /** App opened */
  APP_OPENED: 'app_opened',
  /** App sent to background */
  APP_BACKGROUNDED: 'app_backgrounded',
  /** App brought to foreground */
  APP_FOREGROUNDED: 'app_foregrounded',
  /** Session started */
  SESSION_STARTED: 'session_started',
  /** Session ended */
  SESSION_ENDED: 'session_ended',
  /** App updated */
  APP_UPDATED: 'app_updated',

  // ============================================
  // SETTINGS EVENTS
  // ============================================
  /** Settings page viewed */
  SETTINGS_VIEWED: 'settings_viewed',
  /** Account information page viewed */
  SETTINGS_ACCOUNT_INFO_VIEWED: 'settings_account_info_viewed',
  /** Contact support email opened */
  SETTINGS_CONTACT_SUPPORT: 'settings_contact_support',
  /** Bug report email opened */
  SETTINGS_REPORT_BUG: 'settings_report_bug',
  /** Check for updates initiated */
  SETTINGS_CHECK_UPDATES: 'settings_check_updates',

  // ============================================
  // BRAND VAULT EVENTS
  // ============================================
  /** Brand page viewed */
  BRAND_VIEWED: 'brand_viewed',
  /** Brand category selected from grid */
  BRAND_CATEGORY_SELECTED: 'brand_category_selected',
  /** Agent X chat opened from brand category */
  BRAND_AGENT_CHAT_OPENED: 'brand_agent_chat_opened',
} as const;

export type AppEventName = (typeof APP_EVENTS)[keyof typeof APP_EVENTS];

// ============================================
// USER PROPERTIES
// ============================================
// Custom user properties for segmentation and audiences
// GA4 allows up to 25 custom user properties

/**
 * User Property Names
 * Use these with analytics.setUserProperties()
 *
 * @see https://support.google.com/analytics/answer/9267735
 *
 * @example
 * ```typescript
 * analytics.setUserProperties({
 *   [USER_PROPERTIES.USER_TYPE]: 'athlete',
 *   [USER_PROPERTIES.SPORT]: 'football',
 *   [USER_PROPERTIES.SUBSCRIPTION_TIER]: 'pro',
 * });
 * ```
 */
export const USER_PROPERTIES = {
  // ============================================
  // USER TYPE & ROLE
  // ============================================
  /** User role: athlete, coach, director, recruiter, parent */
  USER_TYPE: 'user_type',
  /** Whether user is verified */
  IS_VERIFIED: 'is_verified',
  /** Account status: active, suspended, deleted */
  ACCOUNT_STATUS: 'account_status',

  // ============================================
  // SUBSCRIPTION & MONETIZATION
  // ============================================
  /** Subscription tier: free, starter, pro, elite */
  SUBSCRIPTION_TIER: 'subscription_tier',
  /** Whether user is premium */
  IS_PREMIUM: 'is_premium',
  /** Remaining AI credits */
  CREDITS_BALANCE: 'credits_balance',
  /** Lifetime value (for high-value user segmentation) */
  LIFETIME_VALUE: 'lifetime_value',

  // ============================================
  // ATHLETE PROPERTIES
  // ============================================
  /** Primary sport */
  SPORT: 'sport',
  /** Position played */
  POSITION: 'position',
  /** Graduation year */
  GRAD_YEAR: 'grad_year',
  /** Recruiting class */
  RECRUITING_CLASS: 'recruiting_class',
  /** Commitment status: uncommitted, committed, signed */
  COMMITMENT_STATUS: 'commitment_status',
  /** State/region */
  STATE: 'state',

  // ============================================
  // ENGAGEMENT PROPERTIES
  // ============================================
  /** Number of followers */
  FOLLOWER_COUNT: 'follower_count',
  /** Number of following */
  FOLLOWING_COUNT: 'following_count',
  /** Number of videos uploaded */
  VIDEO_COUNT: 'video_count',
  /** Profile completion percentage */
  PROFILE_COMPLETION: 'profile_completion',
  /** Days since signup */
  DAYS_SINCE_SIGNUP: 'days_since_signup',
  /** Last active date (YYYYMMDD format) */
  LAST_ACTIVE_DATE: 'last_active_date',

  // ============================================
  // TEAM & ORGANIZATION
  // ============================================
  /** Team code (if part of a team) */
  TEAM_CODE: 'team_code',
  /** Organization name */
  ORGANIZATION: 'organization',

  // ============================================
  // APP CONTEXT
  // ============================================
  /** How user was acquired: organic, paid, referral, team_code */
  ACQUISITION_SOURCE: 'acquisition_source',
  /** App version */
  APP_VERSION: 'app_version',
  /** Platform: web, ios, android */
  PLATFORM: 'platform',
  /** Whether push notifications enabled */
  PUSH_ENABLED: 'push_enabled',
  /** A/B test variant (for experiments) */
  EXPERIMENT_VARIANT: 'experiment_variant',
} as const;

export type UserPropertyName = (typeof USER_PROPERTIES)[keyof typeof USER_PROPERTIES];

/**
 * User properties value types
 */
export interface UserPropertiesMap {
  [USER_PROPERTIES.USER_TYPE]?: UserRole;
  [USER_PROPERTIES.IS_VERIFIED]?: boolean;
  [USER_PROPERTIES.ACCOUNT_STATUS]?: 'active' | 'suspended' | 'deleted';
  [USER_PROPERTIES.SUBSCRIPTION_TIER]?: PlanType;
  [USER_PROPERTIES.IS_PREMIUM]?: boolean;
  [USER_PROPERTIES.CREDITS_BALANCE]?: number;
  [USER_PROPERTIES.LIFETIME_VALUE]?: number;
  [USER_PROPERTIES.SPORT]?: string;
  [USER_PROPERTIES.POSITION]?: string;
  [USER_PROPERTIES.GRAD_YEAR]?: number;
  [USER_PROPERTIES.RECRUITING_CLASS]?: string;
  [USER_PROPERTIES.COMMITMENT_STATUS]?: 'uncommitted' | 'committed' | 'signed';
  [USER_PROPERTIES.STATE]?: string;
  [USER_PROPERTIES.FOLLOWER_COUNT]?: number;
  [USER_PROPERTIES.FOLLOWING_COUNT]?: number;
  [USER_PROPERTIES.VIDEO_COUNT]?: number;
  [USER_PROPERTIES.PROFILE_COMPLETION]?: number;
  [USER_PROPERTIES.DAYS_SINCE_SIGNUP]?: number;
  [USER_PROPERTIES.LAST_ACTIVE_DATE]?: string;
  [USER_PROPERTIES.TEAM_CODE]?: string;
  [USER_PROPERTIES.ORGANIZATION]?: string;
  [USER_PROPERTIES.ACQUISITION_SOURCE]?: TrafficSource;
  [USER_PROPERTIES.APP_VERSION]?: string;
  [USER_PROPERTIES.PLATFORM]?: 'web' | 'ios' | 'android';
  [USER_PROPERTIES.PUSH_ENABLED]?: boolean;
  [USER_PROPERTIES.EXPERIMENT_VARIANT]?: string;
}

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
  ECOMMERCE: 'ecommerce',
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
  | 'organic'
  | 'paid'
  | 'unknown';

/** User role type */
export type UserRole = 'athlete' | 'coach' | 'director' | 'recruiter' | 'parent' | 'anonymous';

/** Viewer type (alias for UserRole for analytics compatibility) */
export type ViewerType = UserRole;

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
export function getEventCategory(eventName: string): EventCategory {
  // Firebase recommended events
  if (eventName === 'sign_up' || eventName === 'login') {
    return EVENT_CATEGORIES.AUTH;
  }
  if (eventName === 'tutorial_begin' || eventName === 'tutorial_complete') {
    return EVENT_CATEGORIES.ONBOARDING;
  }
  if (eventName === 'search' || eventName === 'select_content') {
    return EVENT_CATEGORIES.SEARCH;
  }
  if (eventName === 'share' || eventName === 'join_group') {
    return EVENT_CATEGORIES.ENGAGEMENT;
  }
  if (
    eventName === 'purchase' ||
    eventName === 'refund' ||
    eventName === 'begin_checkout' ||
    eventName === 'add_to_cart' ||
    eventName === 'view_item' ||
    eventName === 'view_item_list' ||
    eventName === 'add_payment_info'
  ) {
    return EVENT_CATEGORIES.ECOMMERCE;
  }
  if (eventName === 'exception' || eventName === 'page_view' || eventName === 'screen_view') {
    return EVENT_CATEGORIES.NAVIGATION;
  }

  // Custom NXT1 events
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
  if (eventName.startsWith('subscription_') || eventName.startsWith('credits_')) {
    return EVENT_CATEGORIES.SUBSCRIPTION;
  }
  if (eventName.startsWith('ai_')) return EVENT_CATEGORIES.AI;
  if (
    eventName.startsWith('screen_') ||
    eventName.startsWith('tab_') ||
    eventName.startsWith('modal_') ||
    eventName.startsWith('navigation_')
  ) {
    return EVENT_CATEGORIES.NAVIGATION;
  }
  if (eventName.startsWith('error_') || eventName.startsWith('api_error')) {
    return EVENT_CATEGORIES.ERROR;
  }
  if (eventName.startsWith('app_') || eventName.startsWith('session_')) {
    return EVENT_CATEGORIES.LIFECYCLE;
  }

  return EVENT_CATEGORIES.LIFECYCLE;
}

/**
 * Check if an event name is a Firebase recommended event
 */
export function isFirebaseEvent(eventName: string): boolean {
  const firebaseEvents = Object.values(FIREBASE_EVENTS);
  return firebaseEvents.includes(eventName as FirebaseEventName);
}

/**
 * Get the Firebase recommended event equivalent for a custom event
 * Returns null if there's no equivalent
 */
export function getFirebaseEquivalent(customEvent: string): FirebaseEventName | null {
  const mapping: Record<string, FirebaseEventName> = {
    auth_signed_up: FIREBASE_EVENTS.SIGN_UP,
    auth_signed_in: FIREBASE_EVENTS.LOGIN,
    auth_signup_completed: FIREBASE_EVENTS.SIGN_UP,
    auth_signin_completed: FIREBASE_EVENTS.LOGIN,
    onboarding_started: FIREBASE_EVENTS.TUTORIAL_BEGIN,
    onboarding_completed: FIREBASE_EVENTS.TUTORIAL_COMPLETE,
    search_performed: FIREBASE_EVENTS.SEARCH,
    subscription_started: FIREBASE_EVENTS.PURCHASE,
    team_code_joined: FIREBASE_EVENTS.JOIN_GROUP,
  };

  return mapping[customEvent] || null;
}
