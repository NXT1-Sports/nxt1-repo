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
  | 'repost'
  | 'stats'
  | 'metrics'
  | 'award'
  | 'camp'
  | 'visit'
  | 'schedule'
  | 'graphic'
  | 'game'
  | 'playoffs'
  | 'news';

/**
 * Post visibility settings.
 */
export type FeedPostVisibility = 'public' | 'followers' | 'team' | 'private';

/**
 * User role for post attribution.
 */
export type FeedAuthorRole = 'athlete' | 'coach' | 'team' | 'recruiter' | 'parent' | 'official';

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
// ACTIVITY DATA TYPES (Unified Timeline)
// ============================================

/**
 * Visit/campus tour data for visit activity posts.
 */
export interface FeedVisitData {
  /** College/university name */
  readonly collegeName: string;
  /** College logo URL */
  readonly collegeLogoUrl?: string;
  /** Visit type */
  readonly visitType: 'official' | 'unofficial' | 'junior-day' | 'game-day';
  /** Location */
  readonly location?: string;
  /** Visit date */
  readonly visitDate: string;
  /** End date (multi-day visits) */
  readonly endDate?: string;
  /** Sport */
  readonly sport?: string;
  /** Graphic/photo from the visit */
  readonly graphicUrl?: string;
}

/**
 * Camp/combine/showcase data for camp activity posts.
 */
export interface FeedCampData {
  /** Camp/event name */
  readonly campName: string;
  /** Organization/host */
  readonly organization?: string;
  /** Camp type */
  readonly campType: 'camp' | 'combine' | 'showcase' | 'invitational';
  /** Location */
  readonly location?: string;
  /** Event date */
  readonly eventDate: string;
  /** Result/award earned */
  readonly result?: string;
  /** Logo URL */
  readonly logoUrl?: string;
  /** Graphic URL */
  readonly graphicUrl?: string;
}

/**
 * Stat update data for stats activity posts.
 */
export interface FeedStatUpdateData {
  /** Game or event context (e.g., "Week 8 vs Central High") */
  readonly context: string;
  /** Game date */
  readonly gameDate?: string;
  /** Game result (e.g., "W 42-14") */
  readonly gameResult?: string;
  /** Opponent name */
  readonly opponent?: string;
  /** Key stats to highlight */
  readonly stats: readonly FeedStatLine[];
  /** Season totals after this game */
  readonly seasonTotals?: readonly FeedStatLine[];
}

/**
 * Individual stat line for stat update cards.
 */
export interface FeedStatLine {
  /** Stat label (e.g., "PASS YDS", "TDs") */
  readonly label: string;
  /** Stat value */
  readonly value: string | number;
  /** Unit/suffix (e.g., "yds", "pts") */
  readonly unit?: string;
  /** Whether this stat is a season high/personal best */
  readonly isHighlight?: boolean;
}

/**
 * Metrics/measurables data for metrics activity posts.
 */
export interface FeedMetricsData {
  /** Measurement source (e.g., "PrepSports Regional Combine") */
  readonly source: string;
  /** Date measured */
  readonly measuredAt: string;
  /** Category (e.g., "Combine Results", "Measurables") */
  readonly category?: string;
  /** Key metrics to show */
  readonly metrics: readonly FeedMetricLine[];
}

/**
 * Individual metric line for metrics cards.
 */
export interface FeedMetricLine {
  /** Metric label (e.g., "40 YARD", "VERTICAL") */
  readonly label: string;
  /** Metric value */
  readonly value: string | number;
  /** Unit (e.g., "s", "in", "lbs") */
  readonly unit?: string;
  /** Whether officially verified */
  readonly verified?: boolean;
  /** Previous value (for showing improvement) */
  readonly previousValue?: string | number;
}

/**
 * Award/achievement data for award activity posts.
 */
export interface FeedAwardData {
  /** Award name */
  readonly awardName: string;
  /** Awarding organization/body */
  readonly organization?: string;
  /** Award category (e.g., "All-District", "MVP", "Academic") */
  readonly category?: string;
  /** Season/year */
  readonly season?: string;
  /** Icon name */
  readonly icon?: string;
}

/**
 * News article data for news activity posts.
 */
export interface FeedNewsData {
  /** Article headline */
  readonly headline: string;
  /** Article source/publication */
  readonly source: string;
  /** Source logo URL */
  readonly sourceLogoUrl?: string;
  /** Article excerpt/summary */
  readonly excerpt?: string;
  /** Article URL */
  readonly articleUrl?: string;
  /** Hero image URL */
  readonly imageUrl?: string;
  /** Published date */
  readonly publishedAt: string;
  /** Category tag */
  readonly category?: string;
}

/**
 * Schedule/game data for schedule activity posts.
 */
export interface FeedScheduleData {
  /** Game/event title */
  readonly eventTitle: string;
  /** Opponent */
  readonly opponent?: string;
  /** Opponent logo URL */
  readonly opponentLogoUrl?: string;
  /** Venue/location */
  readonly venue?: string;
  /** Date/time */
  readonly dateTime: string;
  /** Whether home game */
  readonly isHome?: boolean;
  /** Result if game is completed (e.g., "W 42-14") */
  readonly result?: string;
  /** Game status */
  readonly status: 'upcoming' | 'live' | 'final' | 'postponed' | 'cancelled';
}

/**
 * External platform sync source for AI-curated content.
 */
export interface FeedExternalSource {
  /** Platform name (e.g., "Hudl", "MaxPreps", "247Sports") */
  readonly platform: string;
  /** Platform icon name */
  readonly icon?: string;
  /** Platform logo URL */
  readonly logoUrl?: string;
  /** Original content URL */
  readonly originalUrl?: string;
  /** Display label (e.g., "Synced from Hudl") */
  readonly label: string;
  /** When the sync occurred */
  readonly syncedAt?: string;
}

/**
 * Academic update data for academic activity posts.
 */
export interface FeedAcademicData {
  /** Update type */
  readonly updateType: 'gpa' | 'test-score' | 'honor-roll' | 'eligibility' | 'graduation';
  /** Primary value (e.g., "3.85", "1280") */
  readonly value: string;
  /** Label (e.g., "Cumulative GPA", "SAT Score") */
  readonly label: string;
  /** Secondary value/context */
  readonly context?: string;
  /** Term/semester */
  readonly term?: string;
}

// ============================================
// POST TAGS / ATTACHED DATA
// ============================================

/**
 * Tag/chip type identifiers for attached profile data.
 * Maps to the old NXT1 `attachedProfileData.type`.
 */
export type FeedPostTagType =
  | 'offers'
  | 'stat'
  | 'stats'
  | 'metric'
  | 'metrics'
  | 'award'
  | 'commit'
  | 'schedule'
  | 'visit'
  | 'camps'
  | 'video-tag'
  | 'content-tag'
  | 'highlight'
  | 'custom';

/**
 * Attached profile data tag/chip.
 * Displayed as colored pills on the post card (e.g., "Avg: .423", "Highlight").
 */
export interface FeedPostTag {
  /** Unique tag ID */
  readonly id: string;
  /** Tag category type */
  readonly type: FeedPostTagType;
  /** Display label (e.g., "Avg: .423", "Height: 72") */
  readonly label: string;
  /** Optional description */
  readonly description?: string;
  /** Raw value */
  readonly value?: string | number;
  /** Date associated with tag */
  readonly date?: string;
  /** Hex color for chip styling (default: primary accent) */
  readonly color?: string;
}

// ============================================
// REPOST DATA
// ============================================

/**
 * Repost metadata when a post is shared/reposted by another user.
 */
export interface FeedRepostData {
  /** Reposter's user ID */
  readonly reposterId: string;
  /** Reposter's display name */
  readonly reposterName: string;
  /** Reposter's profile image URL */
  readonly reposterAvatarUrl?: string;
  /** Reposter's profile code for navigation */
  readonly reposterProfileCode?: string;
  /** When the repost was created */
  readonly repostedAt: string;
}

// ============================================
// ENGAGEMENT TYPES
// ============================================

/**
 * Reaction type for fire/emoji reactions.
 */
export type FeedReactionType = 'like' | 'love' | 'celebrate' | 'support' | 'insightful' | null;

/**
 * Engagement metrics for a post.
 */
export interface FeedEngagement {
  /** Number of reactions (fire/emoji) */
  readonly reactionCount: number;
  /** Number of comments */
  readonly commentCount: number;
  /** Number of reposts */
  readonly repostCount: number;
  /** Number of shares */
  readonly shareCount: number;
  /** Number of views */
  readonly viewCount: number;
  /** Legacy: Number of likes (alias for reactionCount) */
  readonly likeCount: number;
  /** Number of bookmarks */
  readonly bookmarkCount?: number;
}

/**
 * User's engagement state with a post.
 */
export interface FeedUserEngagement {
  /** Whether current user has reacted */
  readonly isReacted: boolean;
  /** Current user's reaction type */
  readonly reactionType: FeedReactionType;
  /** Whether current user has liked (legacy alias for isReacted) */
  readonly isLiked: boolean;
  /** Whether current user has bookmarked */
  readonly isBookmarked: boolean;
  /** Whether current user has reposted */
  readonly isReposted: boolean;
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
  /** Post title (bold heading) */
  readonly title?: string;
  /** Post text content / description */
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
  /** Visit data (for visit activity posts) */
  readonly visitData?: FeedVisitData;
  /** Camp/combine/showcase data (for camp activity posts) */
  readonly campData?: FeedCampData;
  /** Stat update data (for stats activity posts) */
  readonly statUpdateData?: FeedStatUpdateData;
  /** Metrics/measurables data (for metrics activity posts) */
  readonly metricsData?: FeedMetricsData;
  /** Award data (for award activity posts) */
  readonly awardData?: FeedAwardData;
  /** News article data (for news activity posts) */
  readonly newsData?: FeedNewsData;
  /** Schedule/game data (for schedule/game activity posts) */
  readonly scheduleData?: FeedScheduleData;
  /** Academic update data (for academic activity posts) */
  readonly academicData?: FeedAcademicData;
  /** External platform source (for AI-synced content) */
  readonly externalSource?: FeedExternalSource;
  /** Original post (for reposts) */
  readonly originalPost?: FeedPost;
  /** Repost metadata (if this post was reposted) */
  readonly repostData?: FeedRepostData;
  /** Engagement metrics */
  readonly engagement: FeedEngagement;
  /** Current user's engagement state */
  readonly userEngagement: FeedUserEngagement;
  /** Attached profile data tags (stat chips, award chips, etc.) */
  readonly postTags?: readonly FeedPostTag[];
  /** Hashtag strings in the post */
  readonly hashtags?: readonly string[];
  /** Mention strings */
  readonly mentions?: readonly string[];
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
 * Feed filter configuration.
 */
export interface FeedFilter {
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
// EXTENDED POST TYPES
// ============================================

/**
 * Post with user-specific metadata (for authenticated users)
 */
export interface FeedPostWithMetadata extends FeedPost {
  /** Whether current user has liked this post */
  readonly likedByCurrentUser?: boolean;
}

// ============================================
// QUERY & CURSOR TYPES
// ============================================

/**
 * Feed query parameters
 */
export interface GetFeedQuery {
  /** Visibility filter */
  readonly visibility?: FeedPostVisibility | string;
  /** Team ID filter */
  readonly teamId?: string;
  /** Items per page */
  readonly limit?: string | number;
  /** Pagination cursor */
  readonly cursor?: string;
}

/**
 * Comments query parameters
 */
export interface GetCommentsQuery {
  /** Items per page */
  readonly limit?: string | number;
  /** Pagination cursor */
  readonly cursor?: string;
}

/**
 * Feed pagination cursor data
 */
export interface FeedCursor {
  /** Last post created timestamp (ISO string) */
  readonly lastCreatedAt: string;
  /** Last post ID */
  readonly lastPostId: string;
}

/**
 * Comments pagination cursor data
 */
export interface CommentsCursor {
  /** Last comment created timestamp (ISO string) */
  readonly lastCreatedAt: string;
  /** Last comment ID */
  readonly lastCommentId: string;
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

// ============================================
// POLYMORPHIC FEED ITEM — DISCRIMINATED UNION
// ============================================
// 2026 Enterprise Standard: Each feed item variant is strictly
// typed via `feedType` discriminator. The backend assembles these
// from multiple Firestore collections (Posts, Events, PlayerStats, etc.)
// and the frontend renders them via @switch (item.feedType).
//
// The legacy FeedPost interface above is preserved for backward
// compatibility during migration and will be removed in Phase 5.
// ============================================

/**
 * Discriminator tag for polymorphic feed items.
 * Each value maps to a specific payload shape.
 */
export type FeedItemType =
  | 'POST'
  | 'EVENT'
  | 'STAT'
  | 'METRIC'
  | 'OFFER'
  | 'COMMITMENT'
  | 'VISIT'
  | 'CAMP'
  | 'AWARD'
  | 'NEWS'
  | 'SCOUT_REPORT'
  | 'ACADEMIC'
  | 'SHARED_REFERENCE';

/**
 * Base fields shared by every feed item regardless of type.
 * Provides the data the "Smart Shell" wrapper needs to render
 * consistently (author, timestamp, engagement, interactions).
 */
export interface FeedItemBase {
  /** Unique item ID (may be prefixed, e.g. "event-abc123") */
  readonly id: string;
  /** Discriminator tag — determines which payload is present */
  readonly feedType: FeedItemType;
  /** Item author / actor */
  readonly author: FeedAuthor;
  /** Engagement counters */
  readonly engagement: FeedEngagement;
  /** Current user's engagement state */
  readonly userEngagement: FeedUserEngagement;
  /** Whether item is pinned to top of timeline */
  readonly isPinned: boolean;
  /** Whether item is featured / promoted */
  readonly isFeatured: boolean;
  /** Created timestamp (ISO 8601) */
  readonly createdAt: string;
  /** Updated timestamp (ISO 8601) */
  readonly updatedAt: string;
}

// --- Variant: Standard Text/Media Post ---

/**
 * A user-authored text or media post from the Posts collection.
 */
export interface FeedItemPost extends FeedItemBase {
  readonly feedType: 'POST';
  /** Post visibility */
  readonly visibility: FeedPostVisibility;
  /** Granular content type for the post (text, image, video, etc.) */
  readonly postType: FeedPostType;
  /** Post title */
  readonly title?: string;
  /** Text body */
  readonly content?: string;
  /** Rich content (markdown/HTML) */
  readonly richContent?: string;
  /** Media attachments */
  readonly media: readonly FeedMedia[];
  /** Hashtags */
  readonly hashtags?: readonly string[];
  /** Mentions */
  readonly mentions?: readonly string[];
  /** Location tag */
  readonly location?: string;
  /** External source annotation (e.g. synced from Hudl) */
  readonly externalSource?: FeedExternalSource;
  /** Whether comments are disabled */
  readonly commentsDisabled: boolean;
  /** Attached profile data tags (stat chips, award chips) */
  readonly postTags?: readonly FeedPostTag[];
  /** Repost metadata */
  readonly repostData?: FeedRepostData;
  /** Original post (for reposts) */
  readonly originalPost?: FeedItemPost;
}

// --- Variant: Structured Game/Event ---

/**
 * A structured game or event from the Events collection.
 * Rendered as a native box score / schedule card.
 */
export interface FeedItemEvent extends FeedItemBase {
  readonly feedType: 'EVENT';
  /** ID of the source document in the Events collection */
  readonly referenceId: string;
  /** Structured event/game data */
  readonly eventData: FeedScheduleData;
}

// --- Variant: Stat Update ---

/**
 * A stat-line update from a game or season, sourced from PlayerStats.
 */
export interface FeedItemStat extends FeedItemBase {
  readonly feedType: 'STAT';
  /** ID of the source document in the PlayerStats collection */
  readonly referenceId: string;
  /** Structured stat data */
  readonly statData: FeedStatUpdateData;
}

// --- Variant: Metrics / Measurables ---

/**
 * Combine results, measurables, or physical testing data.
 */
export interface FeedItemMetric extends FeedItemBase {
  readonly feedType: 'METRIC';
  /** ID of the source document */
  readonly referenceId: string;
  /** Structured metrics data */
  readonly metricsData: FeedMetricsData;
}

// --- Variant: College Offer ---

/**
 * A recruiting offer from a college program.
 */
export interface FeedItemOffer extends FeedItemBase {
  readonly feedType: 'OFFER';
  /** ID of the source recruiting activity document */
  readonly referenceId: string;
  /** Structured offer data */
  readonly offerData: FeedOfferData;
  /** Optional media (offer graphic) */
  readonly media?: readonly FeedMedia[];
}

// --- Variant: Commitment ---

/**
 * A commitment to a college program.
 */
export interface FeedItemCommitment extends FeedItemBase {
  readonly feedType: 'COMMITMENT';
  /** ID of the source recruiting activity document */
  readonly referenceId: string;
  /** Structured commitment data */
  readonly commitmentData: FeedCommitmentData;
  /** Optional media (commitment graphic) */
  readonly media?: readonly FeedMedia[];
}

// --- Variant: Campus Visit ---

/**
 * A campus visit, junior day, or game-day visit.
 */
export interface FeedItemVisit extends FeedItemBase {
  readonly feedType: 'VISIT';
  /** ID of the source event document */
  readonly referenceId: string;
  /** Structured visit data */
  readonly visitData: FeedVisitData;
  /** Optional media (visit photo) */
  readonly media?: readonly FeedMedia[];
}

// --- Variant: Camp/Combine/Showcase ---

/**
 * Attendance or result from a camp, combine, or showcase.
 */
export interface FeedItemCamp extends FeedItemBase {
  readonly feedType: 'CAMP';
  /** ID of the source event document */
  readonly referenceId: string;
  /** Structured camp data */
  readonly campData: FeedCampData;
  /** Optional media (camp graphic) */
  readonly media?: readonly FeedMedia[];
}

// --- Variant: Award ---

/**
 * An award, honor, or achievement.
 */
export interface FeedItemAward extends FeedItemBase {
  readonly feedType: 'AWARD';
  /** ID of the source award document */
  readonly referenceId: string;
  /** Structured award data */
  readonly awardData: FeedAwardData;
}

// --- Variant: News Article ---

/**
 * An AI-generated or syndicated news article.
 */
export interface FeedItemNews extends FeedItemBase {
  readonly feedType: 'NEWS';
  /** ID of the source news document */
  readonly referenceId: string;
  /** Structured news data */
  readonly newsData: FeedNewsData;
}

// --- Variant: AI Scout Report ---

/**
 * An Agent X-generated scout report.
 */
export interface FeedItemScoutReport extends FeedItemBase {
  readonly feedType: 'SCOUT_REPORT';
  /** ID of the source scout report document */
  readonly referenceId: string;
  /** Scout report summary text */
  readonly summary: string;
  /** Overall rating (0-100) */
  readonly overallRating?: number;
  /** Tier classification */
  readonly tier?: string;
}

// --- Variant: Academic Update ---

/**
 * A GPA, test score, or eligibility update.
 */
export interface FeedItemAcademic extends FeedItemBase {
  readonly feedType: 'ACADEMIC';
  /** ID of the source academic document */
  readonly referenceId: string;
  /** Structured academic data */
  readonly academicData: FeedAcademicData;
}

// --- Variant: Shared Reference (Quote-Post) ---

/**
 * A user post that references another entity (event, stat, etc.).
 * Rendered as the user's text caption + an embedded native widget.
 */
export interface FeedItemSharedReference extends FeedItemBase {
  readonly feedType: 'SHARED_REFERENCE';
  /** User's caption text */
  readonly content?: string;
  /** Media attachments */
  readonly media?: readonly FeedMedia[];
  /** Type of the referenced entity */
  readonly referenceType: FeedItemType;
  /** ID of the referenced entity document */
  readonly referenceId: string;
  /** The fully hydrated referenced entity (resolved by backend) */
  readonly referenceItem: FeedItem;
}

// --- The Discriminated Union ---

/**
 * Polymorphic feed item — the 2026 standard for timeline and explore data.
 *
 * Use `item.feedType` as the discriminator in `@switch` blocks:
 * ```typescript
 * @switch (item.feedType) {
 *   @case ('POST') { <nxt1-feed-text-content [data]="item" /> }
 *   @case ('EVENT') { <nxt1-feed-event-card [data]="item" /> }
 *   @case ('STAT') { <nxt1-feed-stat-card [data]="item" /> }
 * }
 * ```
 */
export type FeedItem =
  | FeedItemPost
  | FeedItemEvent
  | FeedItemStat
  | FeedItemMetric
  | FeedItemOffer
  | FeedItemCommitment
  | FeedItemVisit
  | FeedItemCamp
  | FeedItemAward
  | FeedItemNews
  | FeedItemScoutReport
  | FeedItemAcademic
  | FeedItemSharedReference;

// --- Type guard helpers ---

/** Narrow a FeedItem to FeedItemPost */
export function isFeedItemPost(item: FeedItem): item is FeedItemPost {
  return item.feedType === 'POST';
}

/** Narrow a FeedItem to FeedItemEvent */
export function isFeedItemEvent(item: FeedItem): item is FeedItemEvent {
  return item.feedType === 'EVENT';
}

/** Narrow a FeedItem to FeedItemStat */
export function isFeedItemStat(item: FeedItem): item is FeedItemStat {
  return item.feedType === 'STAT';
}

/** Narrow a FeedItem to FeedItemSharedReference */
export function isFeedItemSharedReference(item: FeedItem): item is FeedItemSharedReference {
  return item.feedType === 'SHARED_REFERENCE';
}

// --- Response types for the new polymorphic API ---

/**
 * Polymorphic timeline response from the backend.
 */
export interface FeedItemResponse {
  readonly success: boolean;
  readonly data: readonly FeedItem[];
  readonly nextCursor?: string;
  readonly hasMore: boolean;
}

/**
 * Redis materialized view pointer for explore feed.
 * Stored in Redis by the background worker; hydrated by the API.
 */
export interface FeedPointer {
  /** The feed item type */
  readonly feedType: FeedItemType;
  /** Document ID in the source collection */
  readonly id: string;
  /** Collection name in Firestore */
  readonly collection: string;
  /** Engagement score used by the ranking algorithm */
  readonly score?: number;
}
