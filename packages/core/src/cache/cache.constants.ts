/**
 * @fileoverview Cache Constants
 * @module @nxt1/core/cache
 *
 * ⭐ THIS FILE IS 100% PORTABLE - NO PLATFORM DEPENDENCIES ⭐
 *
 * Cache configuration constants and key prefixes.
 *
 * @author NXT1 Engineering
 * @version 2.0.0
 */

/**
 * Cache configuration defaults
 */
export const CACHE_CONFIG = {
  /** Default TTL: 5 minutes */
  DEFAULT_TTL: 5 * 60 * 1000,

  /** Short TTL: 1 minute (frequently changing data) */
  SHORT_TTL: 60 * 1000,

  /** Medium TTL: 15 minutes (semi-static data) */
  MEDIUM_TTL: 15 * 60 * 1000,

  /** Long TTL: 1 hour (rarely changing data) */
  LONG_TTL: 60 * 60 * 1000,

  /** Extended TTL: 24 hours (static data) */
  EXTENDED_TTL: 24 * 60 * 60 * 1000,

  /** Default max entries for LRU cache */
  DEFAULT_MAX_SIZE: 100,

  /** Large cache max size */
  LARGE_MAX_SIZE: 500,

  /** Small cache max size */
  SMALL_MAX_SIZE: 25,

  /** Storage key prefix */
  STORAGE_PREFIX: 'nxt1_cache_',

  /** Version for cache invalidation on app updates */
  CACHE_VERSION: '1.0.0',

  /** Stale-while-revalidate window in ms */
  STALE_WHILE_REVALIDATE: 30 * 1000,

  /** Max age for stale data to be served */
  MAX_STALE_AGE: 5 * 60 * 1000,
} as const;

/**
 * Cache key prefixes by domain
 */
export const CACHE_KEYS = {
  // User & Profile
  USER_PROFILE: 'user:profile:',
  USER_PREFERENCES: 'user:prefs:',
  USER_SETTINGS: 'user:settings:',

  // Teams
  TEAM_DETAILS: 'team:details:',
  TEAM_MEMBERS: 'team:members:',
  TEAM_LIST: 'team:list',

  // Colleges
  COLLEGE_LIST: 'college:list',
  COLLEGE_DETAILS: 'college:details:',
  COLLEGE_SEARCH: 'college:search:',

  // Posts/Feed
  FEED: 'feed:',
  POST_DETAILS: 'post:details:',

  // Explore
  EXPLORE_TRENDING: 'explore:trending',
  EXPLORE_SUGGESTIONS: 'explore:suggestions:',
  EXPLORE_TAB_COUNTS: 'explore:counts:',
  EXPLORE_SEARCH: 'explore:search:',

  // Video
  VIDEO_LIST: 'video:list:',
  VIDEO_DETAILS: 'video:details:',

  // Static Data
  SPORTS_LIST: 'static:sports',
  POSITIONS_LIST: 'static:positions:',
  STATES_LIST: 'static:states',

  // SSR/SEO
  SSR_META: 'ssr:meta:',

  // API responses
  API_RESPONSE: 'api:',

  // Auth
  AUTH_USER: 'auth:user',
  AUTH_TOKEN: 'auth:token',
} as const;

export type CacheKeyPrefix = (typeof CACHE_KEYS)[keyof typeof CACHE_KEYS];

/**
 * TTL configuration by data type
 */
export const CACHE_TTL_CONFIG = {
  /** User profile - medium (user can update) */
  [CACHE_KEYS.USER_PROFILE]: CACHE_CONFIG.MEDIUM_TTL,

  /** User preferences - long (rarely changes) */
  [CACHE_KEYS.USER_PREFERENCES]: CACHE_CONFIG.LONG_TTL,

  /** Team details - medium */
  [CACHE_KEYS.TEAM_DETAILS]: CACHE_CONFIG.MEDIUM_TTL,

  /** Team members - short (can change frequently) */
  [CACHE_KEYS.TEAM_MEMBERS]: CACHE_CONFIG.SHORT_TTL,

  /** College list - extended (static data) */
  [CACHE_KEYS.COLLEGE_LIST]: CACHE_CONFIG.EXTENDED_TTL,

  /** College details - long */
  [CACHE_KEYS.COLLEGE_DETAILS]: CACHE_CONFIG.LONG_TTL,

  /** Feed - short (new posts frequently) */
  [CACHE_KEYS.FEED]: CACHE_CONFIG.SHORT_TTL,

  /** Explore trending - short (changes frequently) */
  [CACHE_KEYS.EXPLORE_TRENDING]: CACHE_CONFIG.SHORT_TTL,

  /** Explore suggestions - long (type-ahead data is relatively static) */
  [CACHE_KEYS.EXPLORE_SUGGESTIONS]: CACHE_CONFIG.LONG_TTL,

  /** Explore tab counts - medium (doesn't need real-time accuracy) */
  [CACHE_KEYS.EXPLORE_TAB_COUNTS]: CACHE_CONFIG.MEDIUM_TTL,

  /** Explore search results - short (results change with new content) */
  [CACHE_KEYS.EXPLORE_SEARCH]: CACHE_CONFIG.SHORT_TTL,

  /** Post details - medium */
  [CACHE_KEYS.POST_DETAILS]: CACHE_CONFIG.MEDIUM_TTL,

  /** Static data - extended */
  [CACHE_KEYS.SPORTS_LIST]: CACHE_CONFIG.EXTENDED_TTL,
  [CACHE_KEYS.POSITIONS_LIST]: CACHE_CONFIG.EXTENDED_TTL,
  [CACHE_KEYS.STATES_LIST]: CACHE_CONFIG.EXTENDED_TTL,

  /** SSR meta - long */
  [CACHE_KEYS.SSR_META]: CACHE_CONFIG.LONG_TTL,

  /** Auth - medium */
  [CACHE_KEYS.AUTH_USER]: CACHE_CONFIG.MEDIUM_TTL,
} as const;
