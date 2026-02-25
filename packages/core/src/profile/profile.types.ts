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
export type ProfileTabId =
  | 'overview'
  | 'timeline'
  | 'news'
  | 'videos'
  | 'offers'
  | 'metrics'
  | 'stats'
  | 'academic'
  | 'events'
  | 'schedule'
  | 'contact';

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
 * Team affiliation types shown on athlete profiles.
 */
export type ProfileTeamType =
  | 'high-school'
  | 'club'
  | 'juco'
  | 'college'
  | 'academy'
  | 'travel'
  | 'middle-school'
  | 'other';

/**
 * Team affiliation entry (school, club, academy, etc.).
 */
export interface ProfileTeamAffiliation {
  /** Team/organization display name */
  readonly name: string;
  /** Team type for labeling and icon treatment */
  readonly type?: ProfileTeamType;
  /** Team logo URL */
  readonly logoUrl?: string;
  /** Team code (for linking) */
  readonly teamCode?: string;
  /** Location (City, State) */
  readonly location?: string;
  /** Season record label (for example: "10-2" or "10-2-1") */
  readonly seasonRecord?: string;
  /** Optional wins/losses/ties values when no formatted seasonRecord is provided */
  readonly wins?: number | string;
  readonly losses?: number | string;
  readonly ties?: number | string;
}

/**
 * School/Team information.
 */
export interface ProfileSchool {
  /** School name */
  readonly name: string;
  /** School/team type */
  readonly type?: ProfileTeamType;
  /** Team logo URL */
  readonly logoUrl?: string;
  /** Team code (for linking) */
  readonly teamCode?: string;
  /** Location (City, State) */
  readonly location?: string;
  /** Season record label (for example: "10-2" or "10-2-1") */
  readonly seasonRecord?: string;
  /** Optional wins/losses/ties values when no formatted seasonRecord is provided */
  readonly wins?: number | string;
  readonly losses?: number | string;
  readonly ties?: number | string;
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
 * A single award or honor earned by the athlete.
 */
export interface ProfileAward {
  /** Unique award identifier */
  readonly id: string;
  /** Award title (e.g., "All-State First Team", "Camp MVP") */
  readonly title: string;
  /** Issuing organization or event (e.g., "THSCA", "Elite 11") */
  readonly issuer?: string;
  /** Season or date the award was earned (e.g., "2025", "June 2025") */
  readonly season?: string;
  /** Sport the award is associated with */
  readonly sport?: string;
}

/**
 * Coach contact information displayed on athlete profiles.
 */
export interface ProfileCoachContact {
  /** Coach first name */
  readonly firstName: string;
  /** Coach last name */
  readonly lastName: string;
  /** Coach email */
  readonly email?: string;
  /** Coach phone */
  readonly phone?: string;
  /** Coach title (e.g., "Head Coach", "Position Coach") */
  readonly title?: string;
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
  /** Gallery images (additional profile photos) */
  readonly gallery?: readonly string[];
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
  /** Team affiliations shown in right-side profile card */
  readonly teamAffiliations?: readonly ProfileTeamAffiliation[];
  /** Graduation class (e.g., "2026") */
  readonly classYear?: string;
  /** Height (for athletes) */
  readonly height?: string;
  /** Weight (for athletes) */
  readonly weight?: string;
  /** Measurables verified by source (e.g., "Rivals", "247Sports") */
  readonly measurablesVerifiedBy?: string;
  /** URL for the verification source */
  readonly measurablesVerifiedUrl?: string;
  /** Stats verified by source (e.g., "MaxPreps") — powers the shared verification banner */
  readonly statsVerifiedBy?: string;
  /** URL for the stats verification source */
  readonly statsVerifiedUrl?: string;
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
  /** Coach contact information (for athlete profiles) */
  readonly coachContact?: ProfileCoachContact;
  /** Awards and honors (e.g., "All-State", "Camp MVP") */
  readonly awards?: readonly ProfileAward[];
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
  /** ISO date string when these metrics were last measured */
  readonly measuredAt?: string;
  /** Source event or organization (e.g., "PrepSports Regional Combine") */
  readonly source?: string;
}

// ============================================
// GAME LOG / SEASON STATS TYPES (MaxPreps-style)
// ============================================

/**
 * Column definition for the game-log table.
 * Drives dynamic header rendering and cell alignment.
 */
export interface GameLogColumn {
  /** Machine key matching the GameLogEntry.stats keys (e.g., "C", "ATT", "YDS") */
  readonly key: string;
  /** Short header label displayed in the table (e.g., "C", "Att", "Yds") */
  readonly label: string;
  /** Tooltip / full name shown on hover (e.g., "Completions") */
  readonly tooltip?: string;
  /** Whether higher values are better (used for color-coding) — defaults to true */
  readonly higherIsBetter?: boolean;
  /** Optional format hint: 'number', 'pct' (percentage), 'text' */
  readonly format?: 'number' | 'pct' | 'text';
}

/**
 * A single game-log entry (one row in the table).
 */
export interface GameLogEntry {
  /** Game date — display string such as "08/28" or "2025-08-28" */
  readonly date: string;
  /** Game result — "W 44-0", "L 20-51", "T 14-14" */
  readonly result: string;
  /** Whether the game was a win, loss, or tie (drives green/red coloring) */
  readonly outcome: 'win' | 'loss' | 'tie';
  /** Opponent team name — "Selma", "Thomasville" */
  readonly opponent: string;
  /** Dynamic stat values keyed by GameLogColumn.key */
  readonly stats: Readonly<Record<string, string | number>>;
}

/**
 * Summary/total row displayed above the game-log table.
 * Shows aggregated season stats (or per-game averages).
 */
export interface GameLogSeasonTotals {
  /** Label for the summary row — e.g., "Season Totals", "Per Game Avg" */
  readonly label: string;
  /** Dynamic stat values keyed by GameLogColumn.key */
  readonly stats: Readonly<Record<string, string | number>>;
}

/**
 * A full season of game-log data.
 * Groups column definitions, per-game entries, and season totals together.
 */
export interface ProfileSeasonGameLog {
  /** Season label — e.g., "2025-2026", "2024-2025" */
  readonly season: string;
  /** Category — e.g., "Passing", "Rushing", "Receiving", "Defense" */
  readonly category: string;
  /** Team type — distinguishes school (varsity) stats from club/travel team stats */
  readonly teamType?: 'school' | 'club';
  /** Column definitions for this stat category */
  readonly columns: readonly GameLogColumn[];
  /** Per-game entries (rows) */
  readonly games: readonly GameLogEntry[];
  /** Season totals / averages summary row(s) */
  readonly totals?: readonly GameLogSeasonTotals[];
  /** Team season record — e.g., "13-1" */
  readonly seasonRecord?: string;
  /** Whether stats are verified */
  readonly verified?: boolean;
  /** Verification source — e.g., "MaxPreps" */
  readonly verifiedBy?: string;
}

// ============================================
// CONTENT/TIMELINE TYPES
// ============================================

/**
 * Timeline sub-filter identifiers.
 * Used to filter posts within the Timeline tab (Pinned, All, Media).
 */
export type ProfileTimelineFilterId = 'all' | 'pinned' | 'media';

/**
 * Configuration for a timeline filter option.
 */
export interface ProfileTimelineFilter {
  /** Filter identifier */
  readonly id: ProfileTimelineFilterId;
  /** Display label */
  readonly label: string;
  /** Icon name (design-token icon) */
  readonly icon: string;
  /** Empty state title when no posts match */
  readonly emptyTitle: string;
  /** Empty state message when no posts match */
  readonly emptyMessage: string;
}

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
export type OfferType = 'scholarship' | 'preferred_walk_on' | 'interest';

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
  /** Optional graphic/image URL for the offer card */
  readonly graphicUrl?: string;
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
  /** Logo/avatar URL for the entity (college logo, camp logo, etc.) */
  readonly logoUrl?: string;
  /** Full graphic/banner image URL (event flyer, camp graphic, etc.) */
  readonly graphicUrl?: string;
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
// PLAYER CARD / PROSPECT GRADE TYPES (Agent X)
// ============================================

/**
 * Prospect rating tier — determines visual treatment of the OVR badge.
 * Inspired by sports video game rating systems (Madden, 2K).
 */
export type ProspectTier =
  | 'elite'
  | 'blue-chip'
  | 'starter'
  | 'prospect'
  | 'developing'
  | 'unrated';

/**
 * Agent X-generated prospect grade (the "OVR" rating).
 * The centerpiece of the Madden-style player card.
 */
export interface ProspectGrade {
  /** Overall rating 0-99 */
  readonly overall: number;
  /** Rating tier for visual treatment */
  readonly tier: ProspectTier;
  /** Star rating 1-5 (traditional recruiting context) */
  readonly starRating?: number;
  /** When the grade was last computed by Agent X */
  readonly generatedAt?: string;
  /** Agent X confidence in this rating (0-100) */
  readonly confidence?: number;
}

/**
 * A positional skill archetype with individual rating.
 * e.g., "Arm Strength: 92", "Speed: 88", "Court Vision: 85"
 */
export interface PlayerArchetype {
  /** Skill name (e.g., "Arm Strength", "Speed", "Court Vision") */
  readonly name: string;
  /** Rating 0-99 */
  readonly rating: number;
  /** Optional icon key */
  readonly icon?: string;
}

/**
 * Agent X trait category — mirrors video game "Superstar/X-Factor" ability system.
 */
export type AgentXTraitCategory = 'superstar' | 'x-factor' | 'hidden';

/**
 * Agent X assigned trait/ability badge.
 * e.g., "Elite Arm Talent", "Shutdown Corner", "Floor General"
 */
export interface AgentXTrait {
  /** Trait name */
  readonly name: string;
  /** Category determines visual treatment */
  readonly category: AgentXTraitCategory;
  /** Short description of what makes this athlete special */
  readonly description?: string;
  /** Icon key */
  readonly icon?: string;
  /** Progress toward unlocking (for 'hidden' category) */
  readonly progressCurrent?: number;
  /** Total needed to unlock */
  readonly progressTotal?: number;
}

/**
 * Complete player card data generated by Agent X.
 * This is the "Madden Profile" — the AI-powered scouting dashboard.
 */
export interface PlayerCardData {
  /** The OVR rating */
  readonly prospectGrade?: ProspectGrade;
  /** Positional skill breakdowns (3-4 archetypes) */
  readonly archetypes?: readonly PlayerArchetype[];
  /** Featured Agent X trait/ability */
  readonly trait?: AgentXTrait;
  /** AI-generated one-line scouting summary */
  readonly agentXSummary?: string;
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
  /** Game log data per season (MaxPreps-style game-by-game breakdown) */
  readonly gameLog?: readonly ProfileSeasonGameLog[];
  /** Metrics (Combine/Measurables) by category */
  readonly metrics?: readonly AthleticStatsCategory[];
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
  /** Agent X player card data (Madden-style ratings & archetypes) */
  readonly playerCard?: PlayerCardData;
}
