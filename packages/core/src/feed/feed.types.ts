/**
 * @fileoverview Feed Type Definitions
 * @module @nxt1/core/feed
 * @version 1.0.0
 *
 * Pure TypeScript type definitions for Home Feed feature.
 * 100% portable - works on web, mobile, and backend.
 *
 * Features:
 * - Social feed posts (text, media, video)
 * - Engagement actions (like, comment, share)
 * - Feed filtering and pagination
 * - Author attribution with verification
 */

// ============================================
// FEED POST TYPES
// ============================================

/**
 * Post content type identifiers.
 * Determines how the post is rendered.
 */
export type FeedPostType =
  | 'text'
  | 'image'
  | 'video'
  | 'highlight'
  | 'offer'
  | 'commitment'
  | 'article'
  | 'milestone'
  | 'repost';

/**
 * Post visibility settings.
 */
export type FeedPostVisibility = 'public' | 'followers' | 'team' | 'private';

/**
 * User role for post attribution.
 */
export type FeedAuthorRole =
  | 'athlete'
  | 'coach'
  | 'team'
  | 'college_coach'
  | 'fan'
  | 'parent'
  | 'official';

/**
 * Verification status for post authors.
 */
export type FeedVerificationStatus = 'unverified' | 'pending' | 'verified' | 'premium';

// ============================================
// AUTHOR TYPES
// ============================================

/**
 * Post author information.
 */
export interface FeedAuthor {
  /** Unique user ID */
  readonly uid: string;
  /** Profile code/slug for navigation */
  readonly profileCode: string;
  /** Display name */
  readonly displayName: string;
  /** First name */
  readonly firstName: string;
  /** Last name */
  readonly lastName: string;
  /** Profile image URL */
  readonly avatarUrl?: string;
  /** User role */
  readonly role: FeedAuthorRole;
  /** Verification status */
  readonly verificationStatus: FeedVerificationStatus;
  /** Whether user is verified */
  readonly isVerified: boolean;
  /** Primary sport name */
  readonly sport?: string;
  /** Position (for athletes) */
  readonly position?: string;
  /** School/team name */
  readonly schoolName?: string;
  /** School/team logo URL */
  readonly schoolLogoUrl?: string;
  /** Class year (for athletes) */
  readonly classYear?: string;
}

// ============================================
// MEDIA TYPES
// ============================================

/**
 * Media attachment for posts.
 */
export interface FeedMedia {
  /** Unique media ID */
  readonly id: string;
  /** Media type */
  readonly type: 'image' | 'video' | 'gif';
  /** Full-size URL */
  readonly url: string;
  /** Thumbnail URL (for videos/images) */
  readonly thumbnailUrl?: string;
  /** Width in pixels */
  readonly width?: number;
  /** Height in pixels */
  readonly height?: number;
  /** Video duration in seconds */
  readonly duration?: number;
  /** Alt text for accessibility */
  readonly altText?: string;
  /** Blurhash placeholder */
  readonly blurhash?: string;
}

/**
 * College offer data for offer posts.
 */
export interface FeedOfferData {
  /** College name */
  readonly collegeName: string;
  /** College logo URL */
  readonly collegeLogoUrl?: string;
  /** Offer type */
  readonly offerType: 'scholarship' | 'preferred-walk-on' | 'walk-on' | 'interest';
  /** Sport */
  readonly sport: string;
  /** Division (D1, D2, D3, NAIA, JUCO) */
  readonly division?: string;
  /** Conference name */
  readonly conference?: string;
}

/**
 * Commitment data for commitment posts.
 */
export interface FeedCommitmentData {
  /** College name */
  readonly collegeName: string;
  /** College logo URL */
  readonly collegeLogoUrl?: string;
  /** Sport */
  readonly sport: string;
  /** Division */
  readonly division?: string;
  /** Commitment date */
  readonly commitDate: string;
  /** Is official (signed) */
  readonly isSigned: boolean;
}

/**
 * Milestone data for milestone posts.
 */
export interface FeedMilestoneData {
  /** Milestone type */
  readonly type: 'followers' | 'views' | 'ranking' | 'award' | 'record';
  /** Milestone value */
  readonly value: number;
  /** Display label */
  readonly label: string;
  /** Icon name */
  readonly icon: string;
}

// ============================================
// ENGAGEMENT TYPES
// ============================================

/**
 * Engagement metrics for a post.
 */
export interface FeedEngagement {
  /** Number of likes */
  readonly likeCount: number;
  /** Number of comments */
  readonly commentCount: number;
  /** Number of shares/reposts */
  readonly shareCount: number;
  /** Number of views (for videos) */
  readonly viewCount?: number;
  /** Number of bookmarks */
  readonly bookmarkCount?: number;
}

/**
 * User's engagement state with a post.
 */
export interface FeedUserEngagement {
  /** Whether current user has liked */
  readonly isLiked: boolean;
  /** Whether current user has bookmarked */
  readonly isBookmarked: boolean;
  /** Whether current user has reposted */
  readonly isReposted: boolean;
  /** Whether current user follows author */
  readonly isFollowingAuthor: boolean;
}

// ============================================
// MAIN POST TYPE
// ============================================

/**
 * Feed post data model.
 */
export interface FeedPost {
  /** Unique post ID */
  readonly id: string;
  /** Post content type */
  readonly type: FeedPostType;
  /** Post visibility */
  readonly visibility: FeedPostVisibility;
  /** Post author */
  readonly author: FeedAuthor;
  /** Post text content */
  readonly content?: string;
  /** Rich text content (markdown or HTML) */
  readonly richContent?: string;
  /** Media attachments */
  readonly media: readonly FeedMedia[];
  /** Offer data (for offer posts) */
  readonly offerData?: FeedOfferData;
  /** Commitment data (for commitment posts) */
  readonly commitmentData?: FeedCommitmentData;
  /** Milestone data (for milestone posts) */
  readonly milestoneData?: FeedMilestoneData;
  /** Original post (for reposts) */
  readonly originalPost?: FeedPost;
  /** Engagement metrics */
  readonly engagement: FeedEngagement;
  /** Current user's engagement state */
  readonly userEngagement: FeedUserEngagement;
  /** Tags/mentions in the post */
  readonly tags?: readonly string[];
  /** Hashtags in the post */
  readonly hashtags?: readonly string[];
  /** Location tag */
  readonly location?: string;
  /** Whether post is pinned to top */
  readonly isPinned: boolean;
  /** Whether post is featured */
  readonly isFeatured: boolean;
  /** Whether comments are disabled */
  readonly commentsDisabled: boolean;
  /** Created timestamp (ISO string) */
  readonly createdAt: string;
  /** Last updated timestamp (ISO string) */
  readonly updatedAt: string;
}

// ============================================
// FEED FILTER & PAGINATION TYPES
// ============================================

/**
 * Feed filter options.
 */
export type FeedFilterType =
  | 'for-you'
  | 'following'
  | 'sports'
  | 'offers'
  | 'highlights'
  | 'trending';

/**
 * Feed filter configuration.
 */
export interface FeedFilter {
  /** Filter type */
  readonly type?: FeedFilterType;
  /** Filter by sport */
  readonly sport?: string;
  /** Filter by post types */
  readonly postTypes?: readonly FeedPostType[];
  /** Filter by author role */
  readonly authorRoles?: readonly FeedAuthorRole[];
  /** Search query */
  readonly query?: string;
  /** Author UID (for profile feeds) */
  readonly authorUid?: string;
  /** Team code (for team feeds) */
  readonly teamCode?: string;
  /** Only show posts from verified users */
  readonly verifiedOnly?: boolean;
  /** Only show posts with media */
  readonly mediaOnly?: boolean;
  /** Date range start */
  readonly startDate?: string;
  /** Date range end */
  readonly endDate?: string;
}

/**
 * Pagination cursor for infinite scroll.
 */
export interface FeedPagination {
  /** Current page number (1-indexed) */
  readonly page: number;
  /** Items per page */
  readonly limit: number;
  /** Total items available */
  readonly total: number;
  /** Whether more items exist */
  readonly hasMore: boolean;
  /** Cursor for next page (opaque string) */
  readonly nextCursor?: string;
  /** Cursor for previous page */
  readonly prevCursor?: string;
}

// ============================================
// API RESPONSE TYPES
// ============================================

/**
 * Feed API response.
 */
export interface FeedResponse {
  /** Success status */
  readonly success: boolean;
  /** Feed posts */
  readonly data: readonly FeedPost[];
  /** Pagination info */
  readonly pagination: FeedPagination;
  /** Error message (if failed) */
  readonly error?: string;
}

/**
 * Single post API response.
 */
export interface FeedPostResponse {
  /** Success status */
  readonly success: boolean;
  /** Post data */
  readonly data?: FeedPost;
  /** Error message (if failed) */
  readonly error?: string;
}

/**
 * Post action response (like, bookmark, etc).
 */
export interface FeedActionResponse {
  /** Success status */
  readonly success: boolean;
  /** Updated engagement state */
  readonly engagement?: FeedEngagement;
  /** Updated user engagement state */
  readonly userEngagement?: FeedUserEngagement;
  /** Error message (if failed) */
  readonly error?: string;
}

// ============================================
// COMMENT TYPES
// ============================================

/**
 * Comment author info.
 */
export interface FeedCommentAuthor {
  /** User ID */
  readonly uid: string;
  /** Profile code */
  readonly profileCode: string;
  /** Display name */
  readonly displayName: string;
  /** Avatar URL */
  readonly avatarUrl?: string;
  /** Whether verified */
  readonly isVerified: boolean;
}

/**
 * Post comment data.
 */
export interface FeedComment {
  /** Comment ID */
  readonly id: string;
  /** Post ID this comment belongs to */
  readonly postId: string;
  /** Comment author */
  readonly author: FeedCommentAuthor;
  /** Comment text */
  readonly content: string;
  /** Like count */
  readonly likeCount: number;
  /** Whether current user liked */
  readonly isLiked: boolean;
  /** Reply count */
  readonly replyCount: number;
  /** Parent comment ID (for replies) */
  readonly parentId?: string;
  /** Created timestamp */
  readonly createdAt: string;
}

/**
 * Comments response.
 */
export interface FeedCommentsResponse {
  /** Success status */
  readonly success: boolean;
  /** Comments */
  readonly data: readonly FeedComment[];
  /** Pagination info */
  readonly pagination: FeedPagination;
  /** Error message */
  readonly error?: string;
}
