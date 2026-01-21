/**
 * @fileoverview API Constants
 * @module @nxt1/core/constants
 *
 * API endpoint paths and configuration.
 * Base URLs come from environment, these are the path segments.
 * 100% portable - no framework dependencies.
 *
 * @author NXT1 Engineering
 * @version 2.0.0
 */

/**
 * API endpoint paths (append to base URL)
 */
export const API_ENDPOINTS = {
  // ==========================================
  // Authentication
  // ==========================================
  AUTH: {
    LOGIN: '/v1/login',
    REGISTER: '/v1/register',
    LOGOUT: '/v1/logout',
    REFRESH: '/v1/auth/refresh',
    VERIFY_EMAIL: '/v1/auth/verify-email',
    FORGOT_PASSWORD: '/v1/auth/forgot-password',
    RESET_PASSWORD: '/v1/auth/reset-password',
    CHECK_EMAIL: '/v1/auth/check-email',
    CHECK_USERNAME: '/v1/auth/check-username',
  },

  // ==========================================
  // User & Profile
  // ==========================================
  USER: {
    PROFILE: '/v1/profile',
    UPDATE: '/v1/profile/update',
    AVATAR: '/v1/profile/avatar',
    SETTINGS: '/v1/profile/settings',
    DELETE_ACCOUNT: '/v1/profile/delete',
  },

  // ==========================================
  // Video
  // ==========================================
  VIDEO: {
    LIST: '/v1/video',
    UPLOAD: '/v1/video/upload',
    DETAILS: (id: string) => `/v1/video/${id}`,
    DELETE: (id: string) => `/v1/video/${id}`,
    ANALYTICS: (id: string) => `/v1/video/${id}/analytics`,
    MIXTAPE: '/v1/video/mixtape',
    UPDATE: (id: string) => `/v1/video/${id}`,
    REORDER: '/v1/video/reorder',
    PIN: (id: string) => `/v1/video/${id}/pin`,
    THUMBNAIL: (id: string) => `/v1/video/${id}/thumbnail`,
    PROCESS_STATUS: (id: string) => `/v1/video/${id}/status`,
  },

  // ==========================================
  // College/Recruiting
  // ==========================================
  COLLEGE: {
    LIST: '/v1/college',
    DETAILS: (id: string) => `/v1/college/${id}`,
    SEARCH: '/v1/college/search',
    CONTACT: '/v1/college/contact',
    COACHES: (id: string) => `/v1/college/${id}/coaches`,
    PROGRAMS: (id: string) => `/v1/college/${id}/programs`,
    FAVORITES: '/v1/college/favorites',
    FAVORITE: (id: string) => `/v1/college/${id}/favorite`,
  },

  // ==========================================
  // Posts/Feed
  // ==========================================
  POST: {
    FEED: '/v1/post/feed',
    CREATE: '/v1/post',
    DETAILS: (id: string) => `/v1/post/${id}`,
    DELETE: (id: string) => `/v1/post/${id}`,
    LIKE: (id: string) => `/v1/post/${id}/like`,
    COMMENT: (id: string) => `/v1/post/${id}/comment`,
  },

  // ==========================================
  // Teams
  // ==========================================
  TEAM: {
    LIST: '/v1/team',
    CREATE: '/v1/team',
    DETAILS: (code: string) => `/v1/team/${code}`,
    JOIN: '/v1/team/join',
    LEAVE: (code: string) => `/v1/team/${code}/leave`,
    MEMBERS: (code: string) => `/v1/team/${code}/members`,
  },

  // ==========================================
  // Payments
  // ==========================================
  STRIPE: {
    CREATE_CHECKOUT: '/v1/stripe/create-checkout-session',
    CREATE_PORTAL: '/v1/stripe/create-portal-session',
    WEBHOOK: '/v1/stripe/webhook',
  },

  PAYPAL: {
    CREATE_ORDER: '/v1/paypal/create-order',
    CAPTURE: '/v1/paypal/capture',
  },

  // ==========================================
  // AI Features
  // ==========================================
  AI: {
    SCOUTING_REPORT: '/v1/openrouter/scouting-report',
    GRAPHIC: '/v1/runway/generate',
    CHAT: '/v1/openrouter/chat',
  },

  // ==========================================
  // Admin
  // ==========================================
  ADMIN: {
    USERS: '/v1/admin/users',
    USER: (id: string) => `/v1/admin/users/${id}`,
    STATS: '/v1/admin/stats',
    CONTENT: '/v1/admin/content',
    REPORTS: '/v1/admin/reports',
    TEAMS: '/v1/admin/teams',
    COLLEGES: '/v1/admin/colleges',
    TRANSACTIONS: '/v1/admin/transactions',
    FEATURE_FLAGS: '/v1/admin/feature-flags',
    BROADCAST: '/v1/admin/broadcast',
  },

  // ==========================================
  // Rankings
  // ==========================================
  RANKINGS: {
    LIST: '/v1/rankings',
    BY_SPORT: (sport: string) => `/v1/rankings/${sport}`,
    BY_STATE: (state: string) => `/v1/rankings/state/${state}`,
    BY_POSITION: (sport: string, position: string) => `/v1/rankings/${sport}/position/${position}`,
    NATIONAL: '/v1/rankings/national',
    TRENDING: '/v1/rankings/trending',
  },

  // ==========================================
  // Notifications
  // ==========================================
  NOTIFICATIONS: {
    LIST: '/v1/notifications',
    READ: '/v1/notifications/read',
    SETTINGS: '/v1/notifications/settings',
    REGISTER_TOKEN: '/v1/notifications/register-token',
    UNSUBSCRIBE: (token: string) => `/v1/notifications/unsubscribe/${token}`,
  },

  // ==========================================
  // Follow
  // ==========================================
  FOLLOW: {
    FOLLOW: (userId: string) => `/v1/follow/${userId}`,
    UNFOLLOW: (userId: string) => `/v1/follow/${userId}`,
    FOLLOWERS: (userId: string) => `/v1/follow/${userId}/followers`,
    FOLLOWING: (userId: string) => `/v1/follow/${userId}/following`,
    CHECK: (userId: string) => `/v1/follow/${userId}/check`,
  },

  // ==========================================
  // SSR
  // ==========================================
  SSR: {
    META: '/v1/ssr/meta',
  },
} as const;

/**
 * API configuration
 */
export const API_CONFIG = {
  /** Request timeout in milliseconds */
  TIMEOUT: 30000,

  /** Maximum retry attempts */
  MAX_RETRIES: 3,

  /** Retry delay base (exponential backoff) */
  RETRY_DELAY: 1000,

  /** Retry status codes */
  RETRY_STATUS_CODES: [408, 429, 500, 502, 503, 504],

  /** Cache-able HTTP methods */
  CACHEABLE_METHODS: ['GET', 'HEAD'],

  /** Default cache TTL in milliseconds */
  DEFAULT_CACHE_TTL: 5 * 60 * 1000, // 5 minutes
} as const;

/**
 * HTTP Headers
 */
export const HTTP_HEADERS = {
  /** Content type JSON */
  CONTENT_TYPE_JSON: 'application/json',

  /** Content type form data */
  CONTENT_TYPE_FORM: 'multipart/form-data',

  /** Authorization header key */
  AUTHORIZATION: 'Authorization',

  /** API version header */
  API_VERSION: 'X-API-Version',

  /** Request ID for tracing */
  REQUEST_ID: 'X-Request-ID',

  /** Client version */
  CLIENT_VERSION: 'X-Client-Version',
} as const;
