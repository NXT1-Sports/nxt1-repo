/**
 * @fileoverview Application Configuration Constants
 * @module @nxt1/core/constants
 *
 * Core application settings that rarely change but need to be centralized.
 * 100% portable - no framework dependencies.
 *
 * @author NXT1 Engineering
 * @version 2.0.0
 */

export const APP_CONFIG = {
  /** Application name */
  APP_NAME: 'NXT1',

  /** Application version (synced from package.json) */
  VERSION: '2.0.0',

  /** Default pagination size */
  DEFAULT_PAGE_SIZE: 20,

  /** Maximum file upload size in bytes (50MB) */
  MAX_FILE_SIZE: 50 * 1024 * 1024,

  /** Maximum image upload size in bytes (10MB) */
  MAX_IMAGE_SIZE: 10 * 1024 * 1024,

  /** Maximum video upload size in bytes (500MB) */
  MAX_VIDEO_SIZE: 500 * 1024 * 1024,

  /** Supported image formats */
  SUPPORTED_IMAGE_FORMATS: [
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
  ],

  /** Supported video formats */
  SUPPORTED_VIDEO_FORMATS: ['video/mp4', 'video/quicktime', 'video/webm'],

  /** Session timeout in milliseconds (30 minutes) */
  SESSION_TIMEOUT: 30 * 60 * 1000,

  /** Toast notification duration in milliseconds */
  TOAST_DURATION: 4000,

  /** Debounce time for search inputs in milliseconds */
  SEARCH_DEBOUNCE: 300,

  /** Auto-save interval in milliseconds (30 seconds) */
  AUTO_SAVE_INTERVAL: 30 * 1000,

  /** Maximum retry attempts for API calls */
  MAX_RETRY_ATTEMPTS: 3,

  /** Retry delay base in milliseconds */
  RETRY_DELAY_BASE: 1000,
} as const;

/**
 * Environment-specific configuration
 */
export const ENVIRONMENT_CONFIG = {
  /** Analytics batch flush interval */
  ANALYTICS_FLUSH_INTERVAL: 5000,

  /** Cache TTL in milliseconds (5 minutes) */
  CACHE_TTL: 5 * 60 * 1000,

  /** Real-time subscription debounce */
  REALTIME_DEBOUNCE: 500,
} as const;

/**
 * Social Media Configuration
 */
export const SOCIAL_CONFIG = {
  /** Twitter/X share URL */
  TWITTER_SHARE_URL: 'https://twitter.com/intent/tweet',

  /** Facebook share URL */
  FACEBOOK_SHARE_URL: 'https://www.facebook.com/sharer/sharer.php',

  /** Instagram (deep link) */
  INSTAGRAM_URL: 'https://instagram.com',

  /** TikTok (deep link) */
  TIKTOK_URL: 'https://tiktok.com',
} as const;

/**
 * Support & Contact Information
 */
export const SUPPORT_CONFIG = {
  /** Support email */
  SUPPORT_EMAIL: 'support@nxt1sports.com',

  /** Sales email */
  SALES_EMAIL: 'sales@nxt1sports.com',

  /** Help center URL */
  HELP_CENTER_URL: 'https://help.nxt1sports.com',

  /** Terms of service URL */
  TERMS_URL: '/terms',

  /** Privacy policy URL */
  PRIVACY_URL: '/privacy',
} as const;
