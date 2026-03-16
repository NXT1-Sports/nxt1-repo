/**
 * @fileoverview Team Model (v3.0 - Refactored)
 * @module @nxt1/core/models
 *
 * Team type definitions following relational architecture.
 * Teams belong to Organizations. Members are linked via RosterEntries.
 *
 * Architecture Changes (v3.0):
 * - Teams belong to Organizations (orgId reference)
 * - Members NO LONGER stored as array in Team doc
 * - Members linked via RosterEntries collection (many-to-many)
 * - Cleaner separation of concerns
 *
 * Migration from TeamCodes:
 * - Collection renamed: TeamCodes -> Teams
 * - Added orgId (required)
 * - Removed members array (use RosterEntries instead)
 * - Removed memberIds array (query RosterEntries)
 *
 * @author NXT1 Engineering
 * @version 3.0.0
 */

import type { TeamType } from '../constants/user.constants';
import type {
  TeamProfileRecruitingActivity,
  TeamProfileStatsCategory,
} from '../team-profile/team-profile.types';
import type { ContactInfo, SocialLinks } from './user.model';

// ============================================
// TEAM STATUS
// ============================================

export enum TeamStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  ARCHIVED = 'archived',
}

// ============================================
// TEAM SOURCE (Ghost vs Verified)
// ============================================

/** How the team was created */
export type TeamSource = 'admin' | 'user_generated' | 'import';

// ============================================
// TEAM (Main Interface - v3.0)
// ============================================

export interface Team {
  /** Firestore document ID */
  id?: string;

  // ============================================
  // CORE IDENTITY
  // ============================================

  /** Team name (e.g., "Varsity Boys 2026") */
  teamName: string;

  /** Legacy team code for joining (6-digit code) */
  teamCode: string;

  /** Team type - high school, club, college, etc. */
  teamType: TeamType;

  /** Sport name (e.g., "Football", "Basketball") */
  sportName: string;

  // ============================================
  // ORGANIZATION LINK (NEW - v3.0)
  // ============================================

  /**
   * Organization ID this team belongs to.
   * Required - every team must belong to an organization.
   */
  organizationId: string;

  // ============================================
  // LOCATION
  // ============================================

  /** State */
  state: string;

  /** City */
  city: string;

  // ============================================
  // SEASON INFO
  // ============================================

  /** Season/year (e.g., "2026", "Fall 2025") */
  season?: string;

  /** Gender (e.g., "boys", "girls", "co-ed") */
  gender?: 'boys' | 'girls' | 'co-ed';

  /** Division */
  division?: string;

  /** Conference */
  conference?: string;

  // ============================================
  // STATUS & SUBSCRIPTION
  // ============================================

  /** Team status */
  status: TeamStatus;

  /** Package/subscription ID */
  packageId?: string;

  /** Is currently active (legacy field) */
  isActive: boolean;

  /** Free trial info (legacy) */
  isFreeTrial?: boolean;
  trialStartDate?: Date | string;

  /** Expiration date */
  expireAt?: Date | string;

  // ============================================
  // BRANDING
  // ============================================

  /** Team logo URL */
  logoUrl?: string;

  /** @deprecated Use logoUrl instead */
  teamLogoImg?: string;

  /** Primary team color (hex) */
  primaryColor?: string;

  /** @deprecated Use primaryColor instead */
  teamColor1?: string;

  /** Secondary team color (hex) */
  secondaryColor?: string;

  /** @deprecated Use secondaryColor instead */
  teamColor2?: string;

  /** Mascot name */
  mascot?: string;

  /** Team description/about */
  description?: string;

  // ============================================
  // URLs & LINKS
  // ============================================

  /** Custom URL slug */
  customUrl?: string;

  /** URL slug for team page */
  slug?: string;

  /** Unicode identifier (legacy) */
  unicode?: string;

  /** Team links (news, schedule, registration) */
  teamLinks?: {
    newsPageUrl?: string;
    schedulePageUrl?: string;
    registrationUrl?: string;
  };

  // ============================================
  // SEASON STATS
  // ============================================

  /** Current season record */
  seasonRecord?: {
    wins?: number | null;
    losses?: number | null;
    ties?: number | null;
  };

  /** Season-by-season history */
  seasonHistory?: Array<{
    season: string;
    wins: number;
    losses: number;
    ties?: number;
    formatted?: string;
    championships?: string[];
    highlights?: string;
    conference?: string;
    division?: string;
  }>;

  /** Last time stats were updated */
  lastUpdatedStat?: string | Date | null;

  /** Stats categories (embedded in team doc) */
  statsCategories?: TeamProfileStatsCategory[];

  /** Recruiting activities (embedded in team doc) */
  recruitingActivities?: TeamProfileRecruitingActivity[];

  // ============================================
  // CONTACT & SOCIAL
  // ============================================

  /** Social media links */
  socialLinks?: SocialLinks;

  /** Contact information */
  contactInfo?: ContactInfo;

  // ============================================
  // SPONSOR
  // ============================================

  sponsor?: {
    name?: string;
    logoImg?: string;
  };

  // ============================================
  // ANALYTICS (cached counts - read from RosterEntries for source of truth)
  // ============================================

  /**
   * Cached athlete count.
   * Updated when RosterEntries change.
   * For real-time count, query RosterEntries.
   */
  athleteMember: number;

  /**
   * Cached panel member (coach/staff) count.
   * Updated when RosterEntries change.
   */
  panelMember: number;

  /** Total traffic/views */
  totalTraffic?: number;

  /** Analytics data */
  analytic?: {
    totalProfileView: number;
    totalTeamPageTraffic: number;
  };

  // ============================================
  // METADATA
  // ============================================

  /** Created at timestamp */
  createdAt?: Date | string;

  /** @deprecated Use createdAt instead */
  createAt?: Date | string;

  /** Updated at timestamp */
  updatedAt?: Date | string;

  /** Created by user ID */
  createdBy?: string;

  // ============================================
  // GHOST / CLAIM STATUS
  // ============================================

  /**
   * Whether this team has been verified/claimed by a real admin.
   * Ghost entries created during onboarding start as `false`.
   */
  isClaimed?: boolean;

  /** How the team was created */
  source?: TeamSource;
}

// ============================================
// INPUT TYPES
// ============================================

export interface CreateTeamInput {
  teamName: string;
  teamCode: string;
  teamType: TeamType;
  sportName: string;
  organizationId: string; // Required
  state: string;
  city: string;
  createdBy: string;
  season?: string;
  gender?: Team['gender'];
  packageId?: string;
  logoUrl?: string;
  primaryColor?: string;
  secondaryColor?: string;
  /** @deprecated Use logoUrl */
  teamLogoImg?: string;
  /** @deprecated Use primaryColor */
  teamColor1?: string;
  /** @deprecated Use secondaryColor */
  teamColor2?: string;
  mascot?: string;
  division?: string;
  conference?: string;
  description?: string;
  /** Defaults to `true` if not provided */
  isClaimed?: boolean;
  /** Defaults to `'admin'` if not provided */
  source?: TeamSource;
}

export interface UpdateTeamInput {
  teamName?: string;
  teamType?: TeamType;
  sportName?: string;
  state?: string;
  city?: string;
  season?: string;
  gender?: Team['gender'];
  status?: TeamStatus;
  isActive?: boolean;
  logoUrl?: string;
  primaryColor?: string;
  secondaryColor?: string;
  /** @deprecated Use logoUrl */
  teamLogoImg?: string;
  /** @deprecated Use primaryColor */
  teamColor1?: string;
  /** @deprecated Use secondaryColor */
  teamColor2?: string;
  mascot?: string;
  division?: string;
  conference?: string;
  description?: string;
  packageId?: string;
  expireAt?: Date | string;
  socialLinks?: SocialLinks;
  contactInfo?: ContactInfo;
  teamLinks?: Team['teamLinks'];
  seasonRecord?: Team['seasonRecord'];
}

// ============================================
// LEGACY TYPE EXPORTS (for backward compatibility)
// ============================================

/** @deprecated Use Team instead */
export type TeamCode = Team;

/** @deprecated Use Team instead */
export type Code = Team;
