/**
 * @fileoverview Performance Monitoring Types
 * @module @nxt1/core/performance
 *
 * ⭐ THIS FILE IS 100% PORTABLE - NO PLATFORM DEPENDENCIES ⭐
 *
 * Type definitions for Firebase Performance Monitoring integration.
 * Platform implementations (web, iOS, Android) use these shared types.
 *
 * @author NXT1 Engineering
 * @version 1.0.0
 */

// ============================================
// TRACE TYPES
// ============================================

/**
 * Trace states
 */
export type TraceState = 'created' | 'running' | 'stopped';

/**
 * Custom trace metrics
 * Key-value pairs for custom metrics (numbers only)
 */
export type TraceMetrics = Record<string, number>;

/**
 * Custom trace attributes
 * Key-value pairs for custom attributes (strings only)
 */
export type TraceAttributes = Record<string, string>;

/**
 * Trace configuration for custom code traces
 */
export interface TraceConfig {
  /** Unique trace name (e.g., 'user_authentication', 'feed_load') */
  readonly name: string;

  /** Initial metrics to set */
  readonly metrics?: TraceMetrics;

  /** Initial attributes to set */
  readonly attributes?: TraceAttributes;
}

/**
 * Active trace handle returned when starting a trace
 */
export interface ActiveTrace {
  /** Trace name */
  readonly name: string;

  /** Current state */
  readonly state: TraceState;

  /** Start timestamp (ms) */
  readonly startTime: number;

  /** Stop the trace and record duration */
  stop(): Promise<void>;

  /** Set a custom metric value */
  putMetric(name: string, value: number): Promise<void>;

  /** Increment a custom metric by delta (default: 1) */
  incrementMetric(name: string, delta?: number): Promise<void>;

  /** Set a custom attribute */
  putAttribute(name: string, value: string): Promise<void>;

  /** Remove a custom attribute */
  removeAttribute(name: string): Promise<void>;

  /** Get current attribute value */
  getAttribute(name: string): string | undefined;

  /** Get all attributes */
  getAttributes(): TraceAttributes;
}

// ============================================
// HTTP METRIC TYPES
// ============================================

/**
 * HTTP request method
 */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';

/**
 * HTTP metric data for network performance tracking
 */
export interface HttpMetricData {
  /** Full URL */
  readonly url: string;

  /** HTTP method */
  readonly httpMethod: HttpMethod;

  /** Response HTTP status code */
  readonly httpResponseCode?: number;

  /** Request payload size in bytes */
  readonly requestPayloadSize?: number;

  /** Response payload size in bytes */
  readonly responsePayloadSize?: number;

  /** Response content type */
  readonly responseContentType?: string;

  /** Custom attributes */
  readonly attributes?: TraceAttributes;
}

/**
 * Active HTTP metric handle
 */
export interface ActiveHttpMetric {
  /** URL being tracked */
  readonly url: string;

  /** HTTP method */
  readonly method: HttpMethod;

  /** Start timestamp (ms) */
  readonly startTime: number;

  /** Set response HTTP status code */
  setHttpResponseCode(code: number): Promise<void>;

  /** Set request payload size */
  setRequestPayloadSize(bytes: number): Promise<void>;

  /** Set response payload size */
  setResponsePayloadSize(bytes: number): Promise<void>;

  /** Set response content type */
  setResponseContentType(contentType: string): Promise<void>;

  /** Set a custom attribute */
  putAttribute(name: string, value: string): Promise<void>;

  /** Stop the HTTP metric */
  stop(): Promise<void>;
}

// ============================================
// SCREEN TRACE TYPES
// ============================================

/**
 * Screen trace for measuring screen rendering performance
 */
export interface ScreenTrace {
  /** Screen/route name */
  readonly screenName: string;

  /** Start timestamp (ms) */
  readonly startTime: number;

  /** Stop the screen trace */
  stop(): Promise<void>;
}

// ============================================
// CONFIGURATION
// ============================================

/**
 * Performance Monitoring configuration
 */
export interface PerformanceConfig {
  /** Enable/disable performance monitoring (default: true) */
  readonly enabled?: boolean;

  /** Enable/disable automatic screen traces (native only, default: true) */
  readonly screenTracesEnabled?: boolean;

  /** Enable/disable automatic HTTP/S network request monitoring (default: true) */
  readonly networkRequestsEnabled?: boolean;

  /** Custom URL patterns for network request aggregation */
  readonly customUrlPatterns?: string[];

  /** Enable console logging in development (default: false) */
  readonly debugLogging?: boolean;

  /** App version to tag traces with */
  readonly appVersion?: string;
}

/**
 * Default performance configuration
 */
export const DEFAULT_PERFORMANCE_CONFIG: Required<PerformanceConfig> = {
  enabled: true,
  screenTracesEnabled: true,
  networkRequestsEnabled: true,
  customUrlPatterns: [],
  debugLogging: false,
  appVersion: '1.0.0',
};

// ============================================
// PREDEFINED TRACE NAMES
// ============================================

/**
 * Standard trace names for consistency across the app
 *
 * @example
 * ```typescript
 * const trace = await performance.startTrace(TRACE_NAMES.FEED_LOAD);
 * // ... load feed
 * await trace.stop();
 * ```
 */
export const TRACE_NAMES = {
  // Authentication traces
  AUTH_LOGIN: 'auth_login',
  AUTH_REGISTER: 'auth_register',
  AUTH_LOGOUT: 'auth_logout',
  AUTH_TOKEN_REFRESH: 'auth_token_refresh',
  AUTH_SOCIAL_SIGN_IN: 'auth_social_sign_in',
  AUTH_USER_CREATE: 'auth_user_create',
  AUTH_ROLE_UPDATE: 'auth_role_update',
  AUTH_PERSONAL_INFO_UPDATE: 'auth_personal_info_update',
  AUTH_SCHOOL_UPDATE: 'auth_school_update',

  // Data loading traces
  FEED_LOAD: 'feed_load',
  FEED_USER_LOAD: 'feed_user_load',
  FEED_TEAM_LOAD: 'feed_team_load',
  FEED_POST_LOAD: 'feed_post_load',
  FEED_LIKE_TOGGLE: 'feed_like_toggle',
  FEED_SHARE: 'feed_share',
  FEED_REPORT: 'feed_report',
  PROFILE_LOAD: 'profile_load',
  TEAM_LOAD: 'team_load',
  COLLEGE_LIST_LOAD: 'college_list_load',
  COLLEGE_DETAIL_LOAD: 'college_detail_load',
  VIDEO_DETAIL_LOAD: 'video_detail_load',
  SEARCH_EXECUTE: 'search_execute',
  SEARCH_SUGGESTIONS: 'search_suggestions',
  SEARCH_TAB_COUNTS: 'search_tab_counts',
  TRENDING_SEARCHES_LOAD: 'trending_searches_load',
  LOCATION_SEARCH: 'location_search',
  RANKINGS_LOAD: 'rankings_load',

  // Activity traces
  ACTIVITY_FEED_LOAD: 'activity_feed_load',
  ACTIVITY_ITEM_LOAD: 'activity_item_load',
  ACTIVITY_MARK_READ: 'activity_mark_read',
  ACTIVITY_MARK_ALL_READ: 'activity_mark_all_read',
  ACTIVITY_BADGES_LOAD: 'activity_badges_load',
  ACTIVITY_SUMMARY_LOAD: 'activity_summary_load',
  ACTIVITY_ARCHIVE: 'activity_archive',
  ACTIVITY_RESTORE: 'activity_restore',

  // Profile traces
  PROFILE_UPDATE: 'profile_update',
  PROFILE_SPORT_UPDATE: 'profile_sport_update',
  PROFILE_SPORT_ADD: 'profile_sport_add',
  PROFILE_SPORT_REMOVE: 'profile_sport_remove',
  PROFILE_FOLLOW: 'profile_follow',
  PROFILE_UNFOLLOW: 'profile_unfollow',
  PROFILE_FOLLOWERS_LOAD: 'profile_followers_load',
  PROFILE_FOLLOWING_LOAD: 'profile_following_load',
  PROFILE_ANALYTICS_LOAD: 'profile_analytics_load',
  PROFILE_VIEW_TRACK: 'profile_view_track',

  // Post traces
  DRAFT_LOAD: 'draft_load',
  DRAFT_SAVE: 'draft_save',
  DRAFT_DELETE: 'draft_delete',

  // Team traces
  TEAM_JOIN: 'team_join',
  TEAM_CODE_VALIDATE: 'team_code_validate',

  // Onboarding traces
  ONBOARDING_STEP_SAVE: 'onboarding_step_save',
  ONBOARDING_PROFILE_SAVE: 'onboarding_profile_save',
  ONBOARDING_COMPLETE: 'onboarding_complete',
  ONBOARDING_PRELOAD_SCRAPE: 'onboarding_preload_scrape',

  // XP traces
  XP_PREVIEW_LOAD: 'xp_preview_load',

  // Referral traces
  REFERRAL_SOURCE_SAVE: 'referral_source_save',

  // Media traces
  IMAGE_UPLOAD: 'image_upload',
  VIDEO_UPLOAD: 'video_upload',
  MEDIA_PROCESS: 'media_process',
  WELCOME_GRAPHIC_GENERATE: 'welcome_graphic_generate',
  WELCOME_GRAPHIC_UPLOAD: 'welcome_graphic_upload',

  // Navigation traces
  NAVIGATION_COLD_START: 'navigation_cold_start',
  NAVIGATION_WARM_START: 'navigation_warm_start',
  NAVIGATION_ROUTE_CHANGE: 'navigation_route_change',

  // Form traces
  FORM_SUBMISSION: 'form_submission',

  // Payment traces
  PAYMENT_INIT: 'payment_init',
  PAYMENT_PROCESS: 'payment_process',
  SUBSCRIPTION_CHECK: 'subscription_check',

  // Cache traces
  CACHE_HIT: 'cache_hit',
  CACHE_MISS: 'cache_miss',
  CACHE_POPULATE: 'cache_populate',

  // AI traces
  AI_REQUEST: 'ai_request',
  AI_RESPONSE_PARSE: 'ai_response_parse',

  // Agent onboarding traces
  AGENT_ONBOARDING_COMPLETE: 'agent_onboarding_complete',
  AGENT_ONBOARDING_PROGRAM_SEARCH: 'agent_onboarding_program_search',
  AGENT_ONBOARDING_PROGRAM_CLAIM: 'agent_onboarding_program_claim',
  AGENT_ONBOARDING_CONNECTIONS_LOAD: 'agent_onboarding_connections_load',

  // Brand vault traces
  BRAND_LOAD: 'brand_load',
  BRAND_CATEGORY_SELECT: 'brand_category_select',

  // Settings traces
  SETTINGS_LOAD: 'settings_load',
  SETTINGS_PREFERENCE_UPDATE: 'settings_preference_update',

  // Push notification traces
  PUSH_NOTIFICATION_HANDLE: 'push_notification_handle',
  PUSH_DEEP_LINK_ROUTE: 'push_deep_link_route',

  // Help center traces
  HELP_HOME_LOAD: 'help_home_load',
  HELP_CATEGORY_LOAD: 'help_category_load',
  HELP_ARTICLE_LOAD: 'help_article_load',
  HELP_SEARCH: 'help_search',
  HELP_FEEDBACK_SUBMIT: 'help_feedback_submit',
  HELP_FAQ_LOAD: 'help_faq_load',

  // Usage / Billing dashboard traces
  USAGE_DASHBOARD_LOAD: 'usage_dashboard_load',
  USAGE_OVERVIEW_LOAD: 'usage_overview_load',
  USAGE_CHART_LOAD: 'usage_chart_load',
  USAGE_BREAKDOWN_LOAD: 'usage_breakdown_load',
  USAGE_HISTORY_LOAD: 'usage_history_load',
  USAGE_PAYMENT_METHODS_LOAD: 'usage_payment_methods_load',
  USAGE_PAYMENT_METHOD_ADD: 'usage_payment_method_add',
  USAGE_PAYMENT_METHOD_REMOVE: 'usage_payment_method_remove',
  USAGE_PAYMENT_METHOD_DEFAULT: 'usage_payment_method_default',
  USAGE_BUDGET_UPDATE: 'usage_budget_update',
  USAGE_COUPON_REDEEM: 'usage_coupon_redeem',

  // Analytics panel traces
  ANALYTICS_REPORT_LOAD: 'analytics_report_load',
  ANALYTICS_REPORT_REFRESH: 'analytics_report_refresh',

  // News (Pulse) traces
  NEWS_FEED_LOAD: 'news_feed_load',
  NEWS_ARTICLE_LOAD: 'news_article_load',
  NEWS_TRENDING_LOAD: 'news_trending_load',
  NEWS_SEARCH: 'news_search',
  NEWS_LOAD_MORE: 'news_load_more',
  NEWS_USER_LOAD: 'news_user_load',

  // Invite traces
  INVITE_STATS_LOAD: 'invite_stats_load',
  INVITE_HISTORY_LOAD: 'invite_history_load',
  INVITE_LINK_GENERATE: 'invite_link_generate',
  INVITE_SEND: 'invite_send',
  INVITE_SEND_BULK: 'invite_send_bulk',
  INVITE_ACCEPT: 'invite_accept',
} as const;

export type TraceName = (typeof TRACE_NAMES)[keyof typeof TRACE_NAMES];

// ============================================
// METRIC NAMES
// ============================================

/**
 * Standard metric names for custom traces
 */
export const METRIC_NAMES = {
  // Count metrics
  ITEMS_LOADED: 'items_loaded',
  ITEMS_CACHED: 'items_cached',
  RETRY_COUNT: 'retry_count',
  ERROR_COUNT: 'error_count',

  // Size metrics
  PAYLOAD_SIZE_BYTES: 'payload_size_bytes',
  RESPONSE_SIZE_BYTES: 'response_size_bytes',
  CACHE_SIZE_BYTES: 'cache_size_bytes',

  // Time metrics (in milliseconds)
  TIME_TO_FIRST_BYTE: 'time_to_first_byte',
  TIME_TO_INTERACTIVE: 'time_to_interactive',
  PARSE_TIME: 'parse_time',

  // Performance metrics
  FRAME_DROPS: 'frame_drops',
  MEMORY_USAGE: 'memory_usage',
} as const;

export type MetricName = (typeof METRIC_NAMES)[keyof typeof METRIC_NAMES];

// ============================================
// ATTRIBUTE NAMES
// ============================================

/**
 * Standard attribute names for custom traces
 */
export const ATTRIBUTE_NAMES = {
  // User context
  USER_ID: 'user_id',
  USER_ROLE: 'user_role',
  USER_TIER: 'user_tier',

  // Request context
  ENDPOINT: 'endpoint',
  HTTP_METHOD: 'http_method',
  STATUS_CODE: 'status_code',
  CONTENT_TYPE: 'content_type',

  // App context
  SCREEN_NAME: 'screen_name',
  APP_VERSION: 'app_version',
  BUILD_TYPE: 'build_type',
  PLATFORM: 'platform',

  // Feature context
  FEATURE_NAME: 'feature_name',
  SPORT_TYPE: 'sport_type',
  CACHE_STATUS: 'cache_status',

  // Error context
  ERROR_TYPE: 'error_type',
  ERROR_CODE: 'error_code',
} as const;

export type AttributeName = (typeof ATTRIBUTE_NAMES)[keyof typeof ATTRIBUTE_NAMES];
