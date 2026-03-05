/**
 * @fileoverview Team Profile Type Definitions
 * @module @nxt1/core/team-profile
 * @version 1.0.0
 *
 * Pure TypeScript type definitions for the public-facing Team Profile page.
 * 100% portable — works on web, mobile, and backend.
 *
 * @description Enterprise-grade team profile system supporting high-school,
 * club, college, and organization teams with roster, schedule, stats, and
 * recruiting activity views. Mirrors the athlete Profile architecture.
 *
 * NOTE: This is the PUBLIC VIEW of a team. For team admin/management,
 * see @nxt1/core/manage-team.
 */

import type { VerificationStatus, DataVerification } from '../models/user.model';
import type { NewsArticle } from '../news/news.types';
export type { VerificationStatus } from '../models/user.model';
export type { DataVerification } from '../models/user.model';

// ============================================
// TEAM PROFILE TAB TYPES
// ============================================

/**
 * Team Profile tab identifiers for content sections.
 *
 * Tab order: Overview, Timeline, Videos, Roster, Schedule, Stats, News, Recruiting
 * - Timeline and Videos reuse ProfileTimelineComponent patterns
 * - Overview sub-sections: About, Staff, Team History, Quick Stats, Sponsors
 * - Roster sub-sections: split by class year
 */
export type TeamProfileTabId =
  | 'overview'
  | 'timeline'
  | 'videos'
  | 'roster'
  | 'schedule'
  | 'stats'
  | 'news'
  | 'recruiting';

/**
 * Configuration for a team profile content tab.
 */
export interface TeamProfileTab {
  readonly id: TeamProfileTabId;
  readonly label: string;
  readonly icon: string;
  readonly badge?: number;
  readonly disabled?: boolean;
}

// ============================================
// TEAM TYPE & IDENTITY
// ============================================

/**
 * Team type classification.
 */
export type TeamProfileType =
  | 'high-school'
  | 'club'
  | 'college'
  | 'juco'
  | 'academy'
  | 'travel'
  | 'middle-school'
  | 'organization'
  | 'other';

/**
 * Team branding colors.
 */
export interface TeamProfileBranding {
  readonly primaryColor?: string;
  readonly secondaryColor?: string;
  readonly mascot?: string;
}

/**
 * Team social media link.
 */
export interface TeamProfileSocialLink {
  readonly platform: string;
  readonly url: string;
  readonly username?: string;
  readonly displayOrder?: number;
  readonly verified?: boolean;
}

/**
 * Team contact information.
 */
export interface TeamProfileContact {
  readonly email?: string;
  readonly phone?: string;
  readonly website?: string;
  readonly address?: string;
  readonly preferredMethod?: 'email' | 'phone' | 'website';
}

/**
 * Team links for external pages.
 */
export interface TeamProfileLinks {
  readonly newsPageUrl?: string;
  readonly schedulePageUrl?: string;
  readonly registrationUrl?: string;
  readonly rosterUrl?: string;
}

/**
 * Team sponsor entry.
 */
export interface TeamProfileSponsor {
  readonly name: string;
  readonly logoUrl?: string;
  readonly url?: string;
  readonly tier?: 'title' | 'gold' | 'silver' | 'bronze' | 'partner';
}

// ============================================
// TEAM PROFILE ENTITY
// ============================================

/**
 * Core team profile data — the "user" equivalent for teams.
 */
export interface TeamProfileTeam {
  /** Unique team ID (Firestore document ID or teamCode) */
  readonly id: string;
  /** URL-friendly slug (also the teamCode) */
  readonly slug: string;
  /** Unicode identifier for deep linking */
  readonly unicode?: string;
  /** Team display name */
  readonly teamName: string;
  /** Team type classification */
  readonly teamType: TeamProfileType;
  /** Primary sport */
  readonly sport: string;
  /** City */
  readonly city: string;
  /** State */
  readonly state: string;
  /** Full location string (City, State) */
  readonly location: string;
  /** Team logo URL */
  readonly logoUrl?: string;
  /** Banner/cover image URL */
  readonly bannerImg?: string;
  /** Gallery images for carousel display */
  readonly galleryImages?: readonly string[];
  /** About/description text */
  readonly description?: string;
  /** Season record */
  readonly record?: TeamProfileRecord;
  /** Branding */
  readonly branding?: TeamProfileBranding;
  /** Contact information */
  readonly contact?: TeamProfileContact;
  /** Social media links */
  readonly social?: readonly TeamProfileSocialLink[];
  /** External links */
  readonly links?: TeamProfileLinks;
  /** Sponsors */
  readonly sponsors?: readonly TeamProfileSponsor[];
  /** Division (D1, D2, D3, NAIA, JUCO) */
  readonly division?: string;
  /** Conference */
  readonly conference?: string;
  /** Season-by-season history entries (most recent first) */
  readonly seasonHistory?: readonly TeamProfileSeasonHistory[];
  /** Founded year */
  readonly foundedYear?: number;
  /** Home venue/stadium */
  readonly homeVenue?: string;
  /** Verification status */
  readonly verificationStatus: VerificationStatus;
  /** Section-level verifications */
  readonly verifications?: readonly DataVerification[];
  /** Whether the team has an active subscription */
  readonly isActive: boolean;
  /** Package/tier */
  readonly packageId?: string;
  /** Created timestamp */
  readonly createdAt: string;
  /** Last updated timestamp */
  readonly updatedAt: string;
}

/**
 * Season record for a team.
 */
export interface TeamProfileRecord {
  readonly wins: number;
  readonly losses: number;
  readonly ties?: number;
  readonly season?: string;
  readonly formatted?: string;
}

/**
 * A single season history entry for the team's year-by-year timeline.
 * Feeds the shared NxtHistoryTimelineComponent with the same layout
 * used for player history affiliations.
 */
export interface TeamProfileSeasonHistory {
  /** Display season label (e.g. "2024-2025", "2024", "Fall 2023") */
  readonly season: string;
  /** Wins that season */
  readonly wins: number;
  /** Losses that season */
  readonly losses: number;
  /** Ties (optional) */
  readonly ties?: number;
  /** Formatted record override (e.g. "10-2") — computed from wins/losses if absent */
  readonly formatted?: string;
  /** Conference at the time */
  readonly conference?: string;
  /** Division at the time */
  readonly division?: string;
  /** Notable highlight text for the season (e.g. "State Runner-Up", "Conference Champions") */
  readonly highlights?: string;
  /** List of championships/titles won this season */
  readonly championships?: readonly string[];
}

// ============================================
// ROSTER TYPES
// ============================================

/**
 * A single roster member displayed on the team profile.
 */
export interface TeamProfileRosterMember {
  readonly id: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly displayName?: string;
  readonly profileImg?: string;
  readonly profileCode?: string;
  readonly role: 'athlete' | 'coach' | 'media' | 'admin';
  readonly position?: string;
  readonly jerseyNumber?: string;
  readonly classYear?: string;
  readonly height?: string;
  readonly weight?: string;
  readonly isVerified?: boolean;
  readonly joinedAt?: string;
  readonly views?: number;
}

/**
 * Roster sort options.
 */
export type TeamProfileRosterSortOption = 'name' | 'number' | 'position' | 'class' | 'recent';

// ============================================
// SCHEDULE TYPES
// ============================================

/**
 * A single schedule event (game, practice, etc.).
 */
export interface TeamProfileScheduleEvent {
  readonly id: string;
  readonly type: 'game' | 'scrimmage' | 'practice' | 'camp' | 'combine' | 'showcase' | 'other';
  readonly name?: string;
  readonly opponent?: string;
  readonly opponentLogoUrl?: string;
  readonly date: string;
  readonly time?: string;
  readonly location?: string;
  readonly isHome: boolean;
  readonly result?: TeamProfileGameResult;
  readonly status: 'upcoming' | 'live' | 'final' | 'postponed' | 'cancelled';
}

/**
 * Game result.
 */
export interface TeamProfileGameResult {
  readonly teamScore: number;
  readonly opponentScore: number;
  readonly outcome: 'win' | 'loss' | 'tie';
  readonly overtime?: boolean;
}

// ============================================
// TEAM STATS TYPES
// ============================================

/**
 * Aggregate team stat.
 */
export interface TeamProfileStat {
  readonly key: string;
  readonly label: string;
  readonly value: number | string;
  readonly icon?: string;
  readonly trend?: 'up' | 'down' | 'neutral';
  readonly trendValue?: number;
}

/**
 * Team stats category.
 */
export interface TeamProfileStatsCategory {
  readonly name: string;
  readonly stats: readonly TeamProfileStat[];
  readonly season?: string;
}

// ============================================
// TEAM STAFF TYPES
// ============================================

/**
 * A staff member entry.
 */
export interface TeamProfileStaffMember {
  readonly id: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly title: string;
  readonly role:
    | 'head-coach'
    | 'assistant-coach'
    | 'coordinator'
    | 'trainer'
    | 'director'
    | 'other';
  readonly profileImg?: string;
  readonly profileCode?: string;
  readonly email?: string;
  readonly phone?: string;
  readonly bio?: string;
  readonly yearsWithTeam?: number;
}

// ============================================
// TEAM RECRUITING TYPES
// ============================================

/**
 * Recruiting activity categories from the team perspective.
 * Maps to human-readable labels and icons in TEAM_RECRUITING_CATEGORY_*.
 */
export type TeamProfileRecruitingCategory =
  | 'offer-sent'
  | 'commitment-received'
  | 'visit-hosted'
  | 'camp-hosted'
  | 'contact';

/**
 * A recruiting activity from the team perspective.
 * For college teams: offers sent, commitments received, etc.
 */
export interface TeamProfileRecruitingActivity {
  readonly id: string;
  readonly category: TeamProfileRecruitingCategory;
  readonly athleteName: string;
  readonly athleteProfileCode?: string;
  readonly athleteProfileImg?: string;
  readonly position?: string;
  readonly classYear?: string;
  readonly highSchool?: string;
  readonly state?: string;
  readonly sport: string;
  readonly date: string;
  readonly scholarshipType?: string;
  readonly notes?: string;
  readonly verified?: boolean;
}

// ============================================
// FOLLOW/SOCIAL TYPES
// ============================================

/**
 * Follow statistics for a team profile.
 */
export interface TeamProfileFollowStats {
  readonly followersCount: number;
  readonly followingCount?: number;
  readonly isFollowing: boolean;
}

// ============================================
// ANALYTICS/QUICK STATS TYPES
// ============================================

/**
 * Team profile quick stats for display.
 */
export interface TeamProfileQuickStats {
  readonly pageViews: number;
  readonly rosterCount: number;
  readonly totalPosts: number;
  readonly highlightCount: number;
  readonly eventCount: number;
  readonly shareCount: number;
}

// ============================================
// CONTENT/TIMELINE TYPES
// ============================================

/**
 * Team post/content item (same shape as profile posts for reuse).
 */
export type TeamProfilePostType =
  | 'video'
  | 'image'
  | 'text'
  | 'highlight'
  | 'news'
  | 'announcement';

export interface TeamProfilePost {
  readonly id: string;
  readonly type: TeamProfilePostType;
  readonly title?: string;
  readonly body?: string;
  readonly thumbnailUrl?: string;
  readonly mediaUrl?: string;
  readonly externalLink?: string;
  readonly likeCount: number;
  readonly commentCount: number;
  readonly shareCount: number;
  readonly viewCount?: number;
  readonly duration?: number;
  readonly isLiked?: boolean;
  readonly isPinned?: boolean;
  readonly createdAt: string;
}

// ============================================
// HEADER ACTION TYPES
// ============================================

/**
 * Team profile header action button.
 */
export interface TeamProfileHeaderAction {
  readonly id: string;
  readonly label: string;
  readonly icon: string;
  readonly primary?: boolean;
  readonly requiresAuth?: boolean;
  readonly destructive?: boolean;
}

// ============================================
// API RESPONSE TYPES
// ============================================

/**
 * Complete team profile page data response.
 */
export interface TeamProfilePageData {
  /** Core team data */
  readonly team: TeamProfileTeam;
  /** Follow stats */
  readonly followStats: TeamProfileFollowStats;
  /** Quick stats/analytics */
  readonly quickStats: TeamProfileQuickStats;
  /** Roster members */
  readonly roster: readonly TeamProfileRosterMember[];
  /** Schedule events */
  readonly schedule: readonly TeamProfileScheduleEvent[];
  /** Team stat categories */
  readonly stats?: readonly TeamProfileStatsCategory[];
  /** Staff members */
  readonly staff: readonly TeamProfileStaffMember[];
  /** Recent posts/news */
  readonly recentPosts: readonly TeamProfilePost[];
  /** Team news articles from the News collection (type==='team' documents). */
  readonly newsArticles?: readonly NewsArticle[];
  /** Recruiting activity (college teams) */
  readonly recruitingActivity?: readonly TeamProfileRecruitingActivity[];
  /** Whether current user is a team admin */
  readonly isTeamAdmin: boolean;
  /** Whether current user can edit the team */
  readonly canEdit: boolean;
  /** Whether current user is a member */
  readonly isMember: boolean;
}
