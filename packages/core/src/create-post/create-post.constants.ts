/**
 * @fileoverview Create Post Constants
 * @module @nxt1/core/create-post
 * @version 1.0.0
 *
 * Configuration constants for Create Post feature.
 * 100% portable - no platform dependencies.
 */

import type {
  PostType,
  PostPrivacy,
  PostTypeOption,
  PrivacyOption,
  XpRewardTier,
  MediaUploadConfig,
} from './create-post.types';

// ============================================
// POST CONFIGURATION
// ============================================

/**
 * Maximum character count for post content.
 */
export const POST_MAX_CHARACTERS = 2000;

/**
 * Minimum character count for text-only posts.
 */
export const POST_MIN_CHARACTERS = 1;

/**
 * Maximum number of media items per post.
 */
export const POST_MAX_MEDIA = 10;

/**
 * Maximum number of users that can be tagged.
 */
export const POST_MAX_TAGS = 20;

/**
 * Maximum number of poll options.
 */
export const POST_MAX_POLL_OPTIONS = 4;

/**
 * Minimum number of poll options.
 */
export const POST_MIN_POLL_OPTIONS = 2;

/**
 * Maximum poll duration in hours.
 */
export const POST_MAX_POLL_DURATION = 168; // 7 days

/**
 * Auto-save debounce delay in milliseconds.
 */
export const POST_AUTOSAVE_DELAY = 2000;

// ============================================
// MEDIA CONFIGURATION
// ============================================

/**
 * Image upload configuration.
 */
export const IMAGE_UPLOAD_CONFIG: MediaUploadConfig = {
  maxFileSize: 10 * 1024 * 1024, // 10MB
  allowedTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic'],
  maxDimensions: {
    width: 4096,
    height: 4096,
  },
  autoCompress: true,
  compressionQuality: 0.85,
} as const;

/**
 * Video upload configuration.
 */
export const VIDEO_UPLOAD_CONFIG: MediaUploadConfig = {
  maxFileSize: 100 * 1024 * 1024, // 100MB
  allowedTypes: ['video/mp4', 'video/quicktime', 'video/webm', 'video/x-m4v'],
  maxDuration: 300, // 5 minutes
  autoCompress: true,
  compressionQuality: 0.8,
} as const;

/**
 * Combined allowed MIME types for media picker.
 */
export const ALLOWED_MEDIA_TYPES = [
  ...IMAGE_UPLOAD_CONFIG.allowedTypes,
  ...VIDEO_UPLOAD_CONFIG.allowedTypes,
] as const;

// ============================================
// POST TYPE OPTIONS
// ============================================

/**
 * Post type display configuration.
 * Order determines display order in type selector.
 */
export const POST_TYPE_OPTIONS: readonly PostTypeOption[] = [
  {
    id: 'text',
    label: 'Text',
    description: 'Share your thoughts',
    icon: 'chatbubble-outline',
    xpReward: 10,
  },
  {
    id: 'photo',
    label: 'Photo',
    description: 'Share photos',
    icon: 'image-outline',
    xpReward: 25,
    requiresMedia: true,
  },
  {
    id: 'video',
    label: 'Video',
    description: 'Share video clips',
    icon: 'videocam-outline',
    xpReward: 50,
    requiresMedia: true,
  },
  {
    id: 'highlight',
    label: 'Highlight',
    description: 'Game highlights & plays',
    icon: 'flame-outline',
    xpReward: 75,
    requiresMedia: true,
  },
  {
    id: 'stats',
    label: 'Stats',
    description: 'Share game statistics',
    icon: 'stats-chart-outline',
    xpReward: 30,
  },
  {
    id: 'achievement',
    label: 'Achievement',
    description: 'Celebrate a milestone',
    icon: 'trophy-outline',
    xpReward: 40,
  },
  {
    id: 'announcement',
    label: 'Announcement',
    description: 'Important updates',
    icon: 'megaphone-outline',
    xpReward: 20,
  },
  {
    id: 'poll',
    label: 'Poll',
    description: 'Ask a question',
    icon: 'bar-chart-outline',
    xpReward: 15,
  },
] as const;

/**
 * Default post type.
 */
export const POST_DEFAULT_TYPE: PostType = 'text';

// ============================================
// PRIVACY OPTIONS
// ============================================

/**
 * Privacy options with display configuration.
 * Order determines display order in privacy selector.
 */
export const PRIVACY_OPTIONS: readonly PrivacyOption[] = [
  {
    id: 'public',
    label: 'Public',
    description: 'Anyone can see this post',
    icon: 'globe-outline',
    recommended: true,
  },
  {
    id: 'team',
    label: 'Team Only',
    description: 'Only your team members',
    icon: 'shield-outline',
  },
  {
    id: 'coaches',
    label: 'Coaches Only',
    description: 'Only coaches can see',
    icon: 'school-outline',
  },
  {
    id: 'private',
    label: 'Only Me',
    description: 'Only you can see this',
    icon: 'lock-closed-outline',
  },
] as const;

/**
 * Default privacy setting.
 */
export const POST_DEFAULT_PRIVACY: PostPrivacy = 'public';

// ============================================
// XP REWARDS CONFIGURATION
// ============================================

/**
 * XP reward tiers by post type.
 */
export const XP_REWARD_TIERS: readonly XpRewardTier[] = [
  {
    id: 'text',
    type: 'text',
    baseXp: 10,
    bonusXp: 0,
    description: 'Basic XP for text posts',
    icon: 'chatbubble-outline',
    color: 'var(--nxt1-color-info)',
    animationType: 'none',
  },
  {
    id: 'photo',
    type: 'photo',
    baseXp: 25,
    bonusXp: 5,
    description: 'More XP for photo content',
    icon: 'image-outline',
    color: 'var(--nxt1-color-primary)',
    animationType: 'pulse',
  },
  {
    id: 'video',
    type: 'video',
    baseXp: 50,
    bonusXp: 15,
    description: 'Great XP for video content',
    icon: 'videocam-outline',
    color: 'var(--nxt1-color-success)',
    animationType: 'bounce',
  },
  {
    id: 'highlight',
    type: 'highlight',
    baseXp: 75,
    bonusXp: 25,
    description: 'Maximum XP for highlights',
    icon: 'flame-outline',
    color: 'var(--nxt1-color-warning)',
    animationType: 'confetti',
  },
  {
    id: 'stats',
    type: 'stats',
    baseXp: 30,
    bonusXp: 10,
    description: 'Share your statistics',
    icon: 'stats-chart-outline',
    color: 'var(--nxt1-color-info)',
    animationType: 'pulse',
  },
  {
    id: 'achievement',
    type: 'achievement',
    baseXp: 40,
    bonusXp: 20,
    description: 'Celebrate milestones',
    icon: 'trophy-outline',
    color: 'var(--nxt1-color-warning)',
    animationType: 'confetti',
  },
  {
    id: 'announcement',
    type: 'announcement',
    baseXp: 20,
    bonusXp: 5,
    description: 'Share important updates',
    icon: 'megaphone-outline',
    color: 'var(--nxt1-color-info)',
    animationType: 'pulse',
  },
  {
    id: 'poll',
    type: 'poll',
    baseXp: 15,
    bonusXp: 10,
    description: 'Engage your audience',
    icon: 'bar-chart-outline',
    color: 'var(--nxt1-color-secondary)',
    animationType: 'pulse',
  },
] as const;

/**
 * XP bonus multipliers.
 */
export const XP_BONUSES = {
  /** XP per media item (up to max) */
  PER_MEDIA: 5,
  /** Maximum media bonus */
  MAX_MEDIA_BONUS: 25,
  /** XP per tagged user (up to max) */
  PER_TAG: 2,
  /** Maximum tag bonus */
  MAX_TAG_BONUS: 10,
  /** Daily first post bonus */
  DAILY_FIRST_POST: 15,
  /** Streak bonus multiplier */
  STREAK_MULTIPLIER: 1.5,
  /** First ever post bonus */
  FIRST_POST_BONUS: 50,
} as const;

// ============================================
// ICONS FOR UI
// ============================================

/**
 * Icon mapping for post types.
 */
export const POST_TYPE_ICONS: Record<PostType, string> = {
  text: 'chatbubble-outline',
  photo: 'image-outline',
  video: 'videocam-outline',
  highlight: 'flame-outline',
  stats: 'stats-chart-outline',
  achievement: 'trophy-outline',
  announcement: 'megaphone-outline',
  poll: 'bar-chart-outline',
} as const;

/**
 * Icon mapping for privacy levels.
 */
export const PRIVACY_ICONS: Record<PostPrivacy, string> = {
  public: 'globe-outline',
  team: 'shield-outline',
  coaches: 'school-outline',
  private: 'lock-closed-outline',
} as const;

/**
 * Color mapping for post types (CSS variable names).
 */
export const POST_TYPE_COLORS: Record<PostType, string> = {
  text: 'var(--nxt1-color-text-secondary)',
  photo: 'var(--nxt1-color-primary)',
  video: 'var(--nxt1-color-success)',
  highlight: 'var(--nxt1-color-warning)',
  stats: 'var(--nxt1-color-info)',
  achievement: 'var(--nxt1-color-warning)',
  announcement: 'var(--nxt1-color-info)',
  poll: 'var(--nxt1-color-secondary)',
} as const;

// ============================================
// API ENDPOINTS
// ============================================

/**
 * API endpoint paths for create post feature.
 */
export const CREATE_POST_API_ENDPOINTS = {
  /** Create a new post */
  CREATE: '/posts',
  /** Upload media */
  UPLOAD_MEDIA: '/posts/media',
  /** Get draft posts */
  DRAFTS: '/posts/drafts',
  /** Save draft */
  SAVE_DRAFT: '/posts/drafts',
  /** Delete draft */
  DELETE_DRAFT: '/posts/drafts/:id',
  /** Search users for tagging */
  SEARCH_USERS: '/users/search',
  /** Search locations */
  SEARCH_LOCATIONS: '/locations/search',
  /** Get XP preview */
  XP_PREVIEW: '/posts/xp-preview',
} as const;

// ============================================
// UI CONFIGURATION
// ============================================

/**
 * UI configuration for create post feature.
 */
export const CREATE_POST_UI_CONFIG = {
  /** Number of skeleton items to show during loading */
  SKELETON_COUNT: 3,
  /** Debounce delay for user search (ms) */
  SEARCH_DEBOUNCE: 300,
  /** Maximum search results to show */
  MAX_SEARCH_RESULTS: 10,
  /** Animation duration for XP celebration (ms) */
  XP_CELEBRATION_DURATION: 3000,
  /** Confetti particle count */
  CONFETTI_PARTICLES: 50,
  /** Character warning threshold (show warning when approaching limit) */
  CHARACTER_WARNING_THRESHOLD: 0.9,
  /** Show character count after this many characters */
  SHOW_CHARACTER_COUNT_AFTER: 100,
} as const;

// ============================================
// PLACEHOLDER TEXT
// ============================================

/**
 * Placeholder text for different post types.
 */
export const POST_PLACEHOLDERS: Record<PostType, string> = {
  text: "What's on your mind?",
  photo: 'Add a caption to your photos...',
  video: 'Describe your video...',
  highlight: 'Tell us about this highlight...',
  stats: 'Share your game stats...',
  achievement: 'What did you accomplish?',
  announcement: 'Share your announcement...',
  poll: 'Ask your question...',
} as const;

/**
 * Empty state messages for create post.
 */
export const CREATE_POST_EMPTY_STATES = {
  NO_DRAFTS: {
    title: 'No Drafts',
    message: 'Your draft posts will appear here',
    icon: 'document-outline',
  },
  FIRST_POST: {
    title: 'Share Your Journey',
    message: 'Create your first post and earn 50 bonus XP!',
    icon: 'sparkles-outline',
    ctaLabel: 'Create Post',
  },
} as const;
