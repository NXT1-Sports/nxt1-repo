/**
 * @fileoverview Media Model
 * @module @nxt1/core/models
 *
 * Type definitions for user media library and social posts.
 * Extracted from User model for performance and scalability.
 * 100% portable - no framework dependencies.
 *
 * Database Collections:
 * - UserMedia/{userId}     - Media library (profile cards, videos)
 * - Posts/{postId}         - Social feed posts (queryable)
 *
 * @author NXT1 Engineering
 * @version 2.0.0
 */

import type { PostType, UserReaction, VideoFormat } from '../constants/user.constants';

// ============================================
// SCHEMA VERSION
// ============================================

/** Current schema version for migration tracking */
export const MEDIA_SCHEMA_VERSION = 1;

// ============================================
// MEDIA STATUSES
// ============================================

export const MEDIA_STATUSES = {
  PROCESSING: 'processing',
  READY: 'ready',
  FAILED: 'failed',
  DELETED: 'deleted',
} as const;

export type MediaStatus = (typeof MEDIA_STATUSES)[keyof typeof MEDIA_STATUSES];

export const VIDEO_TYPES = {
  MIXTAPE: 'mixtape',
  HIGHLIGHT: 'highlight',
  GAME_FILM: 'game-film',
  RAW: 'raw',
} as const;

export type VideoType = (typeof VIDEO_TYPES)[keyof typeof VIDEO_TYPES];

// ============================================
// BASE MEDIA INTERFACE
// ============================================

/** Base interface for all media items */
export interface MediaItemBase {
  /** Unique media ID */
  id: string;

  /** User who owns this media */
  userId: string;

  /** Display name/title */
  name: string;

  /** Primary URL */
  url: string;

  /** Thumbnail URL */
  thumbnailUrl?: string;

  /** Processing status */
  status: MediaStatus;

  /** Display order (lower = first) */
  order: number;

  /** Share count */
  shareCount: number;

  /** Is pinned to top */
  isPinned: boolean;

  /** Sport index this media belongs to */
  sportIndex?: number;

  /** Tags for filtering */
  tags?: string[];

  /** Timestamps */
  createdAt: Date | string;
  updatedAt: Date | string;
}

// ============================================
// PROFILE CARD
// ============================================

/** Profile card/graphic */
export interface ProfileCard extends MediaItemBase {
  type: 'profile-card';

  /** PNG version URL */
  pngUrl?: string;

  /** Is currently displayed on profile */
  isLive: boolean;

  /** Template used to generate */
  templateId?: string;

  /** Customization data */
  customization?: {
    backgroundColor?: string;
    textColor?: string;
    accentColor?: string;
    layout?: string;
  };
}

// ============================================
// VIDEO MEDIA
// ============================================

/** Video/mixtape media */
export interface VideoMedia extends MediaItemBase {
  type: VideoType;

  /** Duration in seconds */
  duration: number;

  /** HLS streaming URL */
  hlsUrl?: string;

  /** Original format */
  format: VideoFormat;

  /** Available quality levels */
  qualities: string[];

  /** Video dimensions */
  dimensions?: {
    width: number;
    height: number;
  };

  /** File size in bytes */
  fileSize?: number;

  /** Processing progress (0-100) */
  processingProgress?: number;

  /** Error message if processing failed */
  processingError?: string;

  /** View count */
  viewCount: number;

  /** Watch time in seconds (total across all viewers) */
  totalWatchTime: number;

  /** Average completion rate (0-100) */
  avgCompletionRate: number;
}

// ============================================
// USER MEDIA LIBRARY
// ============================================

/**
 * User media library document
 * Stored at: UserMedia/{userId}
 */
export interface UserMediaLibrary {
  /** User ID (document ID) */
  userId: string;

  /** Profile cards */
  profileCards: ProfileCard[];

  /** Videos */
  videos: VideoMedia[];

  /** Currently pinned video ID */
  pinnedVideoId?: string;

  /** Currently live profile card ID */
  liveProfileCardId?: string;

  /** Storage stats */
  storage: {
    /** Total storage used in bytes */
    used: number;
    /** Storage limit in bytes based on plan */
    limit: number;
    /** Last calculated at */
    calculatedAt: Date | string;
  };

  /** Counts for quick access */
  counts: {
    profileCards: number;
    videos: number;
    totalMedia: number;
  };

  /** Timestamps */
  createdAt: Date | string;
  updatedAt: Date | string;

  /** Schema version */
  _schemaVersion: number;
}

// ============================================
// SOCIAL POSTS
// ============================================

/** Mention in a post */
export interface PostMention {
  id: string;
  type: 'user' | 'team' | 'college';
  display: string;
}

/** Attached data to a post */
export interface PostAttachment {
  type: string;
  label: string;
  value?: string | number;
}

/**
 * Social post document
 * Stored at: Posts/{postId}
 *
 * Indexed on: userId, createdAt, type, sportIndex
 */
export interface Post {
  /** Unique post ID */
  id: string;

  /** Author user ID */
  userId: string;

  /** Post type */
  type: PostType;

  /** Post title/headline */
  title: string;

  /** Post description/body */
  description?: string;

  /** Sport index this post belongs to */
  sportIndex: number;

  // =========== MEDIA ===========
  /** Primary media URL */
  mediaUrl?: string;

  /** Thumbnail URL */
  thumbnailUrl?: string;

  /** HLS streaming URL (for video) */
  hlsUrl?: string;

  /** Video format */
  videoFormat?: VideoFormat;

  /** Video duration in seconds */
  videoDuration?: number;

  // =========== VISIBILITY ===========
  /** Is publicly visible */
  isPublic: boolean;

  /** Is pinned to profile */
  isPinned: boolean;

  // =========== ENGAGEMENT ===========
  /** View count */
  views: number;

  /** Share count */
  shares: number;

  /** Total reactions */
  reactions: number;

  /** Breakdown by reaction type */
  reactionCounts?: Partial<Record<Exclude<UserReaction, null>, number>>;

  /** Comment count */
  commentCount: number;

  // =========== REPOST ===========
  /** Is this a repost */
  isRepost: boolean;

  /** Original post ID if repost */
  originalPostId?: string;

  /** Original author if repost */
  originalAuthorId?: string;

  // =========== METADATA ===========
  /** Attached data (stats, achievements, etc.) */
  attachedData?: PostAttachment[];

  /** Hashtags */
  tags?: string[];

  /** Mentions */
  mentions?: PostMention[];

  // =========== TIMESTAMPS ===========
  createdAt: Date | string;
  updatedAt: Date | string;

  /** When pinned (for sorting) */
  pinnedAt?: Date | string;

  // =========== MODERATION ===========
  /** Is hidden by moderation */
  isHidden: boolean;

  /** Moderation reason if hidden */
  moderationReason?: string;

  /** Schema version */
  _schemaVersion: number;
}

/**
 * User reaction to a post
 * Stored at: PostReactions/{postId}/reactions/{userId}
 */
export interface PostReactionRecord {
  userId: string;
  postId: string;
  reaction: UserReaction;
  createdAt: Date | string;
}

/**
 * Post comment
 * Stored at: Posts/{postId}/comments/{commentId}
 */
export interface PostComment {
  id: string;
  postId: string;
  userId: string;
  content: string;

  /** Parent comment ID for replies */
  parentId?: string;

  /** Nested reply count */
  replyCount: number;

  /** Reactions on this comment */
  reactions: number;

  /** Is hidden by moderation */
  isHidden: boolean;

  createdAt: Date | string;
  updatedAt: Date | string;
}

// ============================================
// TYPE GUARDS
// ============================================

export function isProfileCard(media: MediaItemBase): media is ProfileCard {
  return (media as ProfileCard).type === 'profile-card';
}

export function isVideoMedia(media: MediaItemBase): media is VideoMedia {
  const videoTypes: string[] = Object.values(VIDEO_TYPES);
  return videoTypes.includes((media as VideoMedia).type);
}

export function isMediaReady(media: MediaItemBase): boolean {
  return media.status === 'ready';
}

export function isMediaProcessing(media: MediaItemBase): boolean {
  return media.status === 'processing';
}

// ============================================
// FACTORY FUNCTIONS
// ============================================

export function createDefaultMediaLibrary(userId: string): UserMediaLibrary {
  const now = new Date().toISOString();
  return {
    userId,
    profileCards: [],
    videos: [],
    storage: {
      used: 0,
      limit: 0, // Set based on plan
      calculatedAt: now,
    },
    counts: {
      profileCards: 0,
      videos: 0,
      totalMedia: 0,
    },
    createdAt: now,
    updatedAt: now,
    _schemaVersion: MEDIA_SCHEMA_VERSION,
  };
}

export function createDefaultPost(userId: string, type: PostType): Partial<Post> {
  const now = new Date().toISOString();
  return {
    userId,
    type,
    title: '',
    sportIndex: 0,
    isPublic: true,
    isPinned: false,
    views: 0,
    shares: 0,
    reactions: 0,
    commentCount: 0,
    isRepost: false,
    isHidden: false,
    createdAt: now,
    updatedAt: now,
    _schemaVersion: MEDIA_SCHEMA_VERSION,
  };
}

// ============================================
// STORAGE LIMITS (by plan)
// ============================================

export const STORAGE_LIMITS = {
  free: 500 * 1024 * 1024, // 500 MB
  starter: 2 * 1024 * 1024 * 1024, // 2 GB
  pro: 10 * 1024 * 1024 * 1024, // 10 GB
  elite: 50 * 1024 * 1024 * 1024, // 50 GB
  team: 100 * 1024 * 1024 * 1024, // 100 GB
} as const;

export function getStorageLimit(): number {
  return STORAGE_LIMITS.free;
}

export function formatStorageSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

// ============================================
// API REQUEST/RESPONSE TYPES
// ============================================

export interface UploadVideoRequest {
  userId: string;
  name: string;
  type: VideoType;
  sportIndex: number;
  tags?: string[];
}

export interface UploadVideoResponse {
  videoId: string;
  uploadUrl: string; // Signed URL for direct upload
  expiresAt: Date | string;
}

export interface CreateProfileCardRequest {
  userId: string;
  templateId: string;
  sportIndex: number;
  customization?: ProfileCard['customization'];
}

export interface FeedQuery {
  /** Filter by user ID */
  userId?: string;

  /** Filter by post type */
  types?: PostType[];

  /** Filter by sport */
  sportIndex?: number;

  /** Filter by tags */
  tags?: string[];

  /** Only public posts */
  publicOnly?: boolean;

  /** Pagination cursor */
  cursor?: string;

  /** Page size */
  limit?: number;

  /** Sort order */
  orderBy?: 'createdAt' | 'views' | 'reactions';
  orderDirection?: 'asc' | 'desc';
}

export interface FeedResponse {
  posts: Post[];
  nextCursor?: string;
  hasMore: boolean;
}
