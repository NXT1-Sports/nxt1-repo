/**
 * @fileoverview Profile Type Definitions
 * @module @nxt1/core/profile
 * @version 2.0.0
 *
 * Pure TypeScript type definitions for Profile feature.
 * 100% portable - works on web, mobile, and backend.
 *
 * @description Enterprise-grade profile system supporting athletes,
 * coaches, and teams with unified content timeline.
 */

// ============================================
// PROFILE TAB TYPES
// ============================================

/**
 * Profile tab identifiers for content filtering.
 * 'timeline' shows all content, 'videos' filters to video posts only.
 */
export type ProfileTabId = 'timeline' | 'videos' | 'offers' | 'stats' | 'events' | 'contact';

/**
 * Configuration for a profile content tab.
 */
export interface ProfileTab {
  /** Unique tab identifier */
  readonly id: ProfileTabId;
  /** Display label */
  readonly label: string;
  /** Ionicons icon name */
  readonly icon: string;
  /** Badge count (optional) */
  readonly badge?: number;
  /** Whether tab is currently disabled */
  readonly disabled?: boolean;
}

// ============================================
// PROFILE USER TYPES
// ============================================

/**
 * User role types in the platform.
 */
export type ProfileUserRole = 'athlete' | 'coach' | 'team' | 'college_coach' | 'fan' | 'parent';

/**
 * Verification status for profiles.
 */
export type VerificationStatus = 'unverified' | 'pending' | 'verified' | 'premium';

/**
 * Sport information for an athlete.
 */
export interface ProfileSport {
  /** Sport name (e.g., "Football", "Basketball") */
  readonly name: string;
  /** Sport icon/key */
  readonly icon: string;
  /** Primary position */
  readonly position?: string;
  /** Secondary positions */
  readonly secondaryPositions?: readonly string[];
  /** Jersey number */
  readonly jerseyNumber?: string;
}

/**
 * School/Team information.
 */
export interface ProfileSchool {
  /** School name */
  readonly name: string;
  /** Team logo URL */
  readonly logoUrl?: string;
  /** Team code (for linking) */
  readonly teamCode?: string;
  /** Location (City, State) */
  readonly location?: string;
}

/**
 * Social media links for profile.
 */
export interface ProfileSocialLinks {
  readonly twitter?: string;
  readonly instagram?: string;
  readonly hudl?: string;
  readonly youtube?: string;
  readonly maxpreps?: string;
  readonly on3?: string;
  readonly rivals?: string;
  readonly espn?: string;
}

/**
 * Contact information for profile.
 */
export interface ProfileContact {
  /** Email address */
  readonly email?: string;
  /** Phone number */
  readonly phone?: string;
  /** Public email (for coaches) */
  readonly publicEmail?: string;
  /** Preferred contact method */
  readonly preferredMethod?: 'email' | 'phone' | 'message';
  /** Availability status */
  readonly availableForContact?: boolean;
}

/**
 * Profile user data.
 */
export interface ProfileUser {
  /** Unique user ID */
  readonly uid: string;
  /** Profile code/slug (URL-friendly identifier) */
  readonly profileCode: string;
  /** First name */
  readonly firstName: string;
  /** Last name */
  readonly lastName: string;
  /** Display name (computed or custom) */
  readonly displayName?: string;
  /** Profile image URL */
  readonly profileImg?: string;
  /** Banner/cover image URL */
  readonly bannerImg?: string;
  /** User role */
  readonly role: ProfileUserRole;
  /** Whether this is a recruit/athlete */
  readonly isRecruit: boolean;
  /** Whether this is a college coach */
  readonly isCollegeCoach?: boolean;
  /** Verification status */
  readonly verificationStatus: VerificationStatus;
  /** About/bio text */
  readonly aboutMe?: string;
  /** Primary sport info */
  readonly primarySport?: ProfileSport;
  /** Additional sports */
  readonly additionalSports?: readonly ProfileSport[];
  /** School/team info */
  readonly school?: ProfileSchool;
  /** Graduation class (e.g., "2026") */
  readonly classYear?: string;
  /** Height (for athletes) */
  readonly height?: string;
  /** Weight (for athletes) */
  readonly weight?: string;
  /** GPA */
  readonly gpa?: string;
  /** SAT score */
  readonly sat?: string;
  /** ACT score */
  readonly act?: string;
  /** Location (City, State) */
  readonly location?: string;
  /** Social media links */
  readonly social?: ProfileSocialLinks;
  /** Contact information */
  readonly contact?: ProfileContact;
  /** College team name (for college coaches) */
  readonly collegeTeamName?: string;
  /** Title/position (for coaches) */
  readonly title?: string;
  /** Created timestamp */
  readonly createdAt: string;
  /** Last updated timestamp */
  readonly updatedAt: string;
}

// ============================================
// FOLLOW/SOCIAL TYPES
// ============================================

/**
 * Follow statistics for a profile.
 */
export interface ProfileFollowStats {
  /** Total follower count */
  readonly followersCount: number;
  /** Total following count */
  readonly followingCount: number;
  /** Whether current user is following this profile */
  readonly isFollowing: boolean;
  /** Whether current user is followed by this profile */
  readonly isFollowedBy: boolean;
}

// ============================================
// ANALYTICS/STATS TYPES
// ============================================

/**
 * Profile analytics/quick stats.
 */
export interface ProfileQuickStats {
  /** Profile views */
  readonly profileViews: number;
  /** Video views */
  readonly videoViews: number;
  /** Total posts */
  readonly totalPosts: number;
  /** Highlight video count */
  readonly highlightCount: number;
  /** Offer count */
  readonly offerCount: number;
  /** Event count */
  readonly eventCount: number;
  /** College interest count */
  readonly collegeInterestCount: number;
  /** Share count */
  readonly shareCount: number;
}

/**
 * Single stat item for display.
 */
export interface ProfileStatItem {
  /** Unique key */
  readonly key: string;
  /** Display label */
  readonly label: string;
  /** Stat value */
  readonly value: number | string;
  /** Ionicons icon name */
  readonly icon: string;
  /** Optional trend indicator */
  readonly trend?: 'up' | 'down' | 'neutral';
  /** Optional trend percentage */
  readonly trendValue?: number;
}

// ============================================
// ATHLETIC STATS TYPES
// ============================================

/**
 * Sport-specific athletic stat.
 */
export interface AthleticStat {
  /** Stat name/label */
  readonly label: string;
  /** Stat value */
  readonly value: string;
  /** Unit (if applicable) */
  readonly unit?: string;
  /** Category */
  readonly category?: string;
  /** Is verified/official */
  readonly verified?: boolean;
}

/**
 * Athletic stats grouped by category.
 */
export interface AthleticStatsCategory {
  /** Category name (e.g., "Speed", "Strength") */
  readonly name: string;
  /** Stats in this category */
  readonly stats: readonly AthleticStat[];
}

// ============================================
// CONTENT/TIMELINE TYPES
// ============================================

/**
 * Post/content type.
 */
export type ProfilePostType = 'video' | 'image' | 'text' | 'highlight' | 'news' | 'stat' | 'offer';

/**
 * A single post/content item.
 */
export interface ProfilePost {
  /** Unique post ID */
  readonly id: string;
  /** Post type */
  readonly type: ProfilePostType;
  /** Post title/caption */
  readonly title?: string;
  /** Post body/description */
  readonly body?: string;
  /** Thumbnail image URL */
  readonly thumbnailUrl?: string;
  /** Media URL (video/image) */
  readonly mediaUrl?: string;
  /** External link */
  readonly externalLink?: string;
  /** Like count */
  readonly likeCount: number;
  /** Comment count */
  readonly commentCount: number;
  /** Share count */
  readonly shareCount: number;
  /** View count (for videos) */
  readonly viewCount?: number;
  /** Duration (for videos, in seconds) */
  readonly duration?: number;
  /** Whether current user has liked */
  readonly isLiked?: boolean;
  /** Whether post is pinned */
  readonly isPinned?: boolean;
  /** Created timestamp */
  readonly createdAt: string;
}

/**
 * Pinned video/mixtape.
 */
export interface ProfilePinnedVideo {
  /** Video ID */
  readonly id: string;
  /** Video name/title */
  readonly name: string;
  /** Preview/thumbnail image URL */
  readonly previewImage?: string;
  /** Video URL */
  readonly videoUrl?: string;
  /** Duration in seconds */
  readonly duration?: number;
  /** View count */
  readonly viewCount?: number;
}

// ============================================
// OFFER TYPES
// ============================================

/**
 * Offer type.
 */
export type OfferType = 'scholarship' | 'preferred_walk_on' | 'camp_invite' | 'visit' | 'interest';

/**
 * A college offer.
 */
export interface ProfileOffer {
  /** Unique offer ID */
  readonly id: string;
  /** Offer type */
  readonly type: OfferType;
  /** College name */
  readonly collegeName: string;
  /** College logo URL */
  readonly collegeLogoUrl?: string;
  /** Division (D1, D2, D3, NAIA, etc.) */
  readonly division?: string;
  /** Conference */
  readonly conference?: string;
  /** Sport */
  readonly sport: string;
  /** Coach name */
  readonly coachName?: string;
  /** Offer date */
  readonly offeredAt: string;
  /** Whether committed to this offer */
  readonly isCommitted?: boolean;
  /** Notes */
  readonly notes?: string;
}

// ============================================
// EVENT TYPES
// ============================================

/**
 * Event type.
 */
export type EventType = 'game' | 'camp' | 'combine' | 'showcase' | 'visit' | 'practice' | 'other';

/**
 * A scheduled event.
 */
export interface ProfileEvent {
  /** Unique event ID */
  readonly id: string;
  /** Event type */
  readonly type: EventType;
  /** Event name */
  readonly name: string;
  /** Event description */
  readonly description?: string;
  /** Location */
  readonly location?: string;
  /** Start date/time */
  readonly startDate: string;
  /** End date/time */
  readonly endDate?: string;
  /** Is all-day event */
  readonly isAllDay?: boolean;
  /** Event URL/link */
  readonly url?: string;
  /** Opponent (for games) */
  readonly opponent?: string;
  /** Result (for past games) */
  readonly result?: string;
}

// ============================================
// EDIT MODE TYPES
// ============================================

/**
 * Editable profile sections.
 */
export type ProfileEditSection =
  | 'basic_info'
  | 'about'
  | 'sport'
  | 'academics'
  | 'contact'
  | 'social'
  | 'media'
  | 'banner'
  | 'avatar';

/**
 * Edit profile form data.
 */
export interface ProfileEditData {
  /** First name */
  firstName?: string;
  /** Last name */
  lastName?: string;
  /** About/bio text */
  aboutMe?: string;
  /** Location */
  location?: string;
  /** Height */
  height?: string;
  /** Weight */
  weight?: string;
  /** GPA */
  gpa?: string;
  /** SAT score */
  sat?: string;
  /** ACT score */
  act?: string;
  /** Social links */
  social?: Partial<ProfileSocialLinks>;
  /** Contact info */
  contact?: Partial<ProfileContact>;
  /** Banner image file */
  bannerFile?: File;
  /** Profile image file */
  profileFile?: File;
}

// ============================================
// HEADER ACTION TYPES
// ============================================

/**
 * Profile header action button.
 */
export interface ProfileHeaderAction {
  /** Unique action ID */
  readonly id: string;
  /** Display label */
  readonly label: string;
  /** Ionicons icon name */
  readonly icon: string;
  /** Whether action is primary/featured */
  readonly primary?: boolean;
  /** Whether action requires auth */
  readonly requiresAuth?: boolean;
  /** Whether action is destructive */
  readonly destructive?: boolean;
}

// ============================================
// API RESPONSE TYPES
// ============================================

/**
 * Profile page data response.
 */
export interface ProfilePageData {
  /** User profile data */
  readonly user: ProfileUser;
  /** Follow stats */
  readonly followStats: ProfileFollowStats;
  /** Quick stats/analytics */
  readonly quickStats: ProfileQuickStats;
  /** Athletic stats by category */
  readonly athleticStats?: readonly AthleticStatsCategory[];
  /** Pinned video/mixtape */
  readonly pinnedVideo?: ProfilePinnedVideo;
  /** Recent posts */
  readonly recentPosts: readonly ProfilePost[];
  /** Offers (for athletes) */
  readonly offers?: readonly ProfileOffer[];
  /** Events */
  readonly events?: readonly ProfileEvent[];
  /** Whether current user is viewing own profile */
  readonly isOwnProfile: boolean;
  /** Whether current user can edit this profile */
  readonly canEdit: boolean;
}
