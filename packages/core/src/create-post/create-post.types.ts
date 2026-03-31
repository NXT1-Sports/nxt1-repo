/**
 * @fileoverview Create Post Type Definitions
 * @module @nxt1/core/create-post
 * @version 1.0.0
 *
 * Pure TypeScript type definitions for Create Post feature.
 * 100% portable - works on web, mobile, and backend.
 */

// ============================================
// POST TYPE ENUMS
// ============================================

/**
 * Type of post content.
 * Determines styling, validation rules, and XP rewards.
 */
export type PostType =
  | 'text'
  | 'photo'
  | 'video'
  | 'highlight'
  | 'stats'
  | 'achievement'
  | 'announcement'
  | 'poll';

/**
 * Privacy level for post visibility.
 */
export type PostPrivacy = 'public' | 'team' | 'coaches' | 'private';

/**
 * Media type for attachments.
 */
export type MediaType = 'image' | 'video' | 'gif';

/**
 * Upload status for media items.
 */
export type UploadStatus = 'pending' | 'uploading' | 'processing' | 'complete' | 'error';

/**
 * Status of the post creation process.
 */
export type CreatePostStatus =
  | 'idle'
  | 'composing'
  | 'uploading'
  | 'validating'
  | 'submitting'
  | 'success'
  | 'error';

// ============================================
// MEDIA TYPES
// ============================================

/**
 * Media item attached to a post.
 */
export interface PostMedia {
  /** Unique identifier for the media item */
  readonly id: string;
  /** Type of media */
  readonly type: MediaType;
  /** Local file URI or blob URL (before upload) */
  readonly localUri?: string;
  /** Remote URL (after upload) */
  readonly url?: string;
  /** Thumbnail URL for videos */
  readonly thumbnailUrl?: string;
  /** File name */
  readonly fileName: string;
  /** File size in bytes */
  readonly fileSize: number;
  /** MIME type */
  readonly mimeType: string;
  /** Width in pixels (for images/videos) */
  readonly width?: number;
  /** Height in pixels (for images/videos) */
  readonly height?: number;
  /** Duration in seconds (for videos) */
  readonly duration?: number;
  /** Upload progress (0-100) */
  readonly progress: number;
  /** Upload status */
  readonly status: UploadStatus;
  /** Error message if upload failed */
  readonly error?: string;
  /** Alt text for accessibility */
  readonly altText?: string;
  /** Order index for display */
  readonly order: number;
}

/**
 * Media upload configuration.
 */
export interface MediaUploadConfig {
  /** Maximum file size in bytes */
  readonly maxFileSize: number;
  /** Allowed MIME types */
  readonly allowedTypes: readonly string[];
  /** Maximum dimensions for images */
  readonly maxDimensions?: {
    readonly width: number;
    readonly height: number;
  };
  /** Maximum duration for videos in seconds */
  readonly maxDuration?: number;
  /** Whether to auto-compress before upload */
  readonly autoCompress: boolean;
  /** Quality for compression (0-1) */
  readonly compressionQuality: number;
}

// ============================================
// USER/TAG TYPES
// ============================================

/**
 * User that can be tagged in a post.
 */
export interface TaggableUser {
  readonly id: string;
  readonly displayName: string;
  readonly username: string;
  readonly photoUrl?: string;
  readonly verified?: boolean;
  readonly type: 'athlete' | 'coach' | 'team' | 'college';
}

/**
 * Location for geotagging posts.
 */
export interface PostLocation {
  readonly id: string;
  readonly name: string;
  readonly address?: string;
  readonly city?: string;
  readonly state?: string;
  readonly country?: string;
  readonly latitude?: number;
  readonly longitude?: number;
  readonly placeType?: 'school' | 'stadium' | 'gym' | 'field' | 'other';
}

// ============================================
// POLL TYPES
// ============================================

/**
 * Poll option for poll-type posts.
 */
export interface PollOption {
  readonly id: string;
  readonly text: string;
  readonly voteCount: number;
  readonly percentage: number;
}

/**
 * Poll configuration.
 */
export interface PostPoll {
  /** Poll question */
  readonly question: string;
  /** Poll options (2-4) */
  readonly options: readonly PollOption[];
  /** Poll duration in hours */
  readonly durationHours: number;
  /** Whether poll has ended */
  readonly isEnded: boolean;
  /** Total vote count */
  readonly totalVotes: number;
  /** End timestamp */
  readonly endsAt: string;
}

// ============================================
// XP/GAMIFICATION TYPES
// ============================================

/**
 * XP reward tier information.
 */
export interface XpRewardTier {
  readonly id: string;
  readonly type: PostType;
  readonly baseXp: number;
  readonly bonusXp: number;
  readonly description: string;
  readonly icon: string;
  readonly color: string;
  readonly animationType: 'pulse' | 'bounce' | 'confetti' | 'none';
}

/**
 * XP breakdown for a post.
 */
export interface PostXpBreakdown {
  /** Base XP for post type */
  readonly baseXp: number;
  /** Bonus XP for media */
  readonly mediaBonus: number;
  /** Bonus XP for tagging users */
  readonly tagBonus: number;
  /** Bonus XP for first post of the day */
  readonly dailyBonus: number;
  /** Bonus XP for streak */
  readonly streakBonus: number;
  /** Total XP earned */
  readonly totalXp: number;
  /** Current streak count */
  readonly streakCount: number;
  /** Whether this is user's first post */
  readonly isFirstPost: boolean;
}

// ============================================
// POST DRAFT TYPES
// ============================================

/**
 * Draft post being composed.
 */
export interface PostDraft {
  /** Unique draft ID */
  readonly id: string;
  /** Post content text */
  readonly content: string;
  /** Post type */
  readonly type: PostType;
  /** Privacy setting */
  readonly privacy: PostPrivacy;
  /** Attached media */
  readonly media: readonly PostMedia[];
  /** Tagged users */
  readonly taggedUsers: readonly TaggableUser[];
  /** Location (optional) */
  readonly location?: PostLocation;
  /** Poll data (for poll posts) */
  readonly poll?: PostPoll;
  /** Scheduled post time (optional) */
  readonly scheduledFor?: string;
  /** Last saved timestamp */
  readonly savedAt: string;
  /** Character count */
  readonly characterCount: number;
}

// ============================================
// API REQUEST/RESPONSE TYPES
// ============================================

/**
 * Request to create a new post.
 */
export interface CreatePostRequest {
  readonly content: string;
  readonly type: PostType;
  readonly privacy: PostPrivacy;
  readonly mediaIds: readonly string[];
  readonly taggedUserIds: readonly string[];
  readonly locationId?: string;
  readonly poll?: {
    readonly question: string;
    readonly options: readonly string[];
    readonly durationHours: number;
  };
  readonly scheduledFor?: string;
}

/**
 * Response after creating a post.
 */
export interface CreatePostResponse {
  readonly success: boolean;
  readonly postId?: string;
  readonly xpEarned?: PostXpBreakdown;
  readonly error?: string;
  readonly errors?: readonly PostValidationError[];
}

/**
 * Media upload request.
 */
export interface MediaUploadRequest {
  readonly file: File | Blob;
  readonly fileName: string;
  readonly mimeType: string;
  readonly altText?: string;
}

/**
 * Media upload response.
 */
export interface MediaUploadResponse {
  readonly success: boolean;
  readonly mediaId?: string;
  readonly url?: string;
  readonly thumbnailUrl?: string;
  readonly error?: string;
}

// ============================================
// VALIDATION TYPES
// ============================================

/**
 * Validation error for post creation.
 */
export interface PostValidationError {
  readonly field: string;
  readonly message: string;
  readonly code: string;
}

/**
 * Validation result for post.
 */
export interface PostValidationResult {
  readonly isValid: boolean;
  readonly errors: readonly PostValidationError[];
  readonly warnings: readonly PostValidationError[];
}

// ============================================
// UI STATE TYPES
// ============================================

/**
 * Create post UI state.
 */
export interface CreatePostState {
  /** Current status */
  readonly status: CreatePostStatus;
  /** Current draft */
  readonly draft: PostDraft;
  /** XP preview (calculated before submission) */
  readonly xpPreview: PostXpBreakdown | null;
  /** Whether showing XP celebration */
  readonly showXpCelebration: boolean;
  /** Earned XP after submission */
  readonly earnedXp: PostXpBreakdown | null;
  /** Validation result */
  readonly validation: PostValidationResult | null;
  /** Error message */
  readonly error: string | null;
  /** Whether draft has unsaved changes */
  readonly isDirty: boolean;
  /** Whether auto-save is in progress */
  readonly isAutoSaving: boolean;
  /** Whether media is uploading */
  readonly isUploadingMedia: boolean;
  /** Overall upload progress (0-100) */
  readonly uploadProgress: number;
}

/**
 * Privacy option display configuration.
 */
export interface PrivacyOption {
  readonly id: PostPrivacy;
  readonly label: string;
  readonly description: string;
  readonly icon: string;
  readonly recommended?: boolean;
}

/**
 * Post type option display configuration.
 */
export interface PostTypeOption {
  readonly id: PostType;
  readonly label: string;
  readonly description: string;
  readonly icon: string;
  readonly xpReward: number;
  readonly requiresMedia?: boolean;
  readonly disabled?: boolean;
}
