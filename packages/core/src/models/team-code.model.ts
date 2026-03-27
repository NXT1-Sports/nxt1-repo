/**
 * @fileoverview Team Code Model
 * @module @nxt1/core/models
 *
 * Canonical team code/organization type definitions.
 * Single source of truth for all team-related types.
 * 100% portable - no framework dependencies.
 *
 * @author NXT1 Engineering
 * @version 2.0.0
 */

import type { TeamType } from '../constants/user.constants';
import type {
  TeamProfileRecruitingActivity,
  TeamProfileStatsCategory,
} from '../team-profile/team-profile.types';
import type { ConnectedSource, ContactInfo, SocialLinks } from './user.model';

// ============================================
// TEAM MEMBER ROLES
// ============================================

/**
 * Team member roles within an organization
 *
 * Unicode generation logic:
 * - admin: Team creator, team gets 6-digit unicode (e.g., "980718")
 * - athlete: Member unicode = team_unicode + "01" (e.g., "98071801")
 * - coach: Member unicode = team_unicode + "02" (e.g., "98071802")
 * - media: Member unicode = team_unicode + "03" (e.g., "98071803")
 */
export enum ROLE {
  admin = 'Administrative',
  athlete = 'Athlete',
  coach = 'Coach',
  media = 'Media',
}

/**
 * API-compatible team type values
 * Maps to TEAM_TYPES from user.constants.ts
 */
export type TeamTypeApi =
  | 'high-school'
  | 'club'
  | 'college'
  | 'organization'
  | 'juco'
  | 'middle-school';

// ============================================
// TEAM MEMBER
// ============================================

export interface TeamMember {
  id: string;
  firstName: string;
  lastName: string;
  name: string;
  joinTime: string | Date;
  role: ROLE;
  isVerify: boolean;
  position?: string[] | string;
  classOf?: number;
  gpa?: string | number;
  profileLink?: string;
  email: string;
  phoneNumber: string;
  title?: string;
  [key: string]: unknown;
}

// ============================================
// TEAM ANALYTICS
// ============================================

export interface TeamAnalytics {
  totalProfileView: number;
  totalTeamPageTraffic: number;
}

// ============================================
// TEAM CODE (Main Interface)
// ============================================

export interface Code {
  id?: string;
  teamCode: string;
  teamName: string;
  /** Team type - uses TeamType from user.constants.ts */
  teamType: TeamType | TeamTypeApi;
  /** Sport name (e.g. 'Football', 'Basketball'). Maps to Firestore field `sportName` for backward compat. */
  sport: string;
  /** @deprecated Use `sport` instead. Kept for backward compat with existing reads. */
  sportName?: string;
  /** @deprecated Location lives on Organization. Kept for backward compat with existing docs. */
  state: string;
  /** @deprecated Location lives on Organization. Kept for backward compat with existing docs. */
  city: string;
  /** Reference to the parent Organization document */
  organizationId?: string;
  /**
   * Team level / division within the same sport under an organization.
   * Examples: 'Varsity', 'JV', 'Freshman', '16U', '15U', '14U', 'A Team', 'B Team'.
   * Together with `organizationId` + `sport` this forms the unique squad identity:
   *   e.g. "Hoover High School" + "Football" + "Varsity" ≠ "…" + "Football" + "JV"
   */
  level?: string;
  role?: ROLE;
  athleteMember: number;
  panelMember: number;
  members?: TeamMember[];
  memberIds?: string[];
  /** @deprecated Billing lives on Organization. Kept for backward compat with existing docs. */
  packageId?: string;
  isActive: boolean;
  isFreeTrial?: boolean;
  trialStartDate?: Date | string;
  /** @deprecated Billing lives on Organization. Kept for backward compat with existing docs. */
  expireAt?: Date | string;
  /** @deprecated Use `createdAt` instead. */
  createAt?: Date | string;
  createdAt?: Date | string;
  /** @deprecated Use logoUrl on Organization. Kept for backward compat. */
  teamLogoImg?: string;
  /** @deprecated Branding lives on Organization. Kept for backward compat with existing docs. */
  logoUrl?: string;
  /** @deprecated Use primaryColor on Organization. Kept for backward compat. */
  teamColor1?: string;
  /** @deprecated Branding lives on Organization. Kept for backward compat with existing docs. */
  primaryColor?: string;
  /** @deprecated Use secondaryColor on Organization. Kept for backward compat. */
  teamColor2?: string;
  /** @deprecated Branding lives on Organization. Kept for backward compat with existing docs. */
  secondaryColor?: string;
  /** @deprecated Branding lives on Organization. Kept for backward compat with existing docs. */
  mascot?: string;
  customUrl?: string;
  unicode?: string;
  slug?: string;
  division?: string;
  conference?: string;
  /** Team description/about text */
  description?: string;
  seasonRecord?: {
    wins?: number | null;
    losses?: number | null;
    ties?: number | null;
  };
  /** Season-by-season history entries (most recent first) */
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
  lastUpdatedStat?: string | Date | null;
  socialLinks?: SocialLinks;
  /** Connected sources (V2) — replaces socialLinks. Each entry is a platform URL with sync status. */
  connectedSources?: ConnectedSource[];
  contactInfo?: ContactInfo;
  teamLinks?: {
    newsPageUrl?: string;
    schedulePageUrl?: string;
    registrationUrl?: string;
  };
  sponsor?: {
    name?: string;
    logoImg?: string;
  };
  totalTraffic?: number;
  analytic?: TeamAnalytics;
  /** Gallery images (URLs) for the team profile page */
  galleryImages?: string[];
  /** Stats categories embedded in the team document (e.g. Offense, Defense, Season Record) */
  statsCategories?: TeamProfileStatsCategory[];
  /** Recruiting activity items embedded in the team document */
  recruitingActivities?: TeamProfileRecruitingActivity[];
}

export type TeamCode = Code;

// ============================================
// TEAM CODE API INPUT TYPES
// ============================================

/**
 * Input for creating a new team code.
 *
 * Branding (logoUrl, colors, mascot) and location (city, state)
 * belong on the **Organization** document — not on the team.
 * Teams reference their Organization via `organizationId`.
 */
export interface CreateTeamCodeInput {
  teamCode: string;
  teamName: string;
  teamType: TeamType | TeamTypeApi;
  /** Sport name (e.g. 'Football', 'Basketball') */
  sport: string;
  createdBy: string; // User ID (owner)
  /** Role of the user creating the team (determines member role in team doc) */
  creatorRole?: 'athlete' | 'coach' | 'director' | 'media' | 'parent' | 'fan';
  /** Display name for the creator member entry */
  creatorName?: string;
  /** Optional creator email for initial members[] payload */
  creatorEmail?: string;
  /** Optional creator phone number for initial members[] payload */
  creatorPhoneNumber?: string;
  unicode?: string;
  /** Team level/division (Varsity, JV, 16U, etc.) */
  level?: string;
  division?: string;
  conference?: string;
}

/**
 * Input for updating team code.
 *
 * Branding (logoUrl, colors, mascot) and location (city, state)
 * belong on the **Organization** document — not on the team.
 * Update those fields via the Organization API instead.
 */
export interface UpdateTeamCodeInput {
  teamName?: string;
  teamType?: TeamType | TeamTypeApi;
  /** Sport name (e.g. 'Football', 'Basketball') */
  sport?: string;
  athleteMember?: number;
  panelMember?: number;
  isActive?: boolean;
  unicode?: string;
  /** Update the team level/division (Varsity, JV, 16U, etc.) */
  level?: string;
  division?: string;
  conference?: string;
}

/**
 * Input for user joining a team
 */
export interface JoinTeamInput {
  userId: string;
  teamCode: string;
  role?: ROLE;
  userProfile: {
    firstName: string;
    lastName: string;
    email: string;
    phoneNumber?: string;
  };
}

/**
 * Input for inviting a member to team
 */
export interface InviteMemberInput {
  teamId: string;
  userId: string;
  role: ROLE;
  invitedBy: string;
  userProfile: {
    firstName: string;
    lastName: string;
    email: string;
    phoneNumber?: string;
  };
}

/**
 * Input for updating member role
 */
export interface UpdateMemberRoleInput {
  teamId: string;
  userId: string;
  newRole: ROLE;
  updatedBy: string;
}

/**
 * Input for bulk member role update
 */
export interface BulkUpdateMemberInput {
  userId: string;
  newRole: ROLE;
}

/**
 * Result of bulk member role update
 */
export interface BulkUpdateResult {
  successCount: number;
  failedCount: number;
  errors: Array<{ userId: string; error: string }>;
}
