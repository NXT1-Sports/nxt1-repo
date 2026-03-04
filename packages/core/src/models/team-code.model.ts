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
import type { ContactInfo, SocialLinks } from './user.model';

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
  sportName: string;
  state: string;
  city: string;
  role?: ROLE;
  athleteMember: number;
  panelMember: number;
  members?: TeamMember[];
  memberIds?: string[];
  packageId: string;
  isActive: boolean;
  isFreeTrial?: boolean;
  trialStartDate?: Date | string;
  expireAt?: Date | string;
  createAt?: Date | string;
  teamLogoImg?: string;
  teamColor1?: string;
  teamColor2?: string;
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
}

export type TeamCode = Code;

// ============================================
// TEAM CODE API INPUT TYPES
// ============================================

/**
 * Input for creating a new team code
 */
export interface CreateTeamCodeInput {
  teamCode: string;
  teamName: string;
  teamType: TeamType | TeamTypeApi;
  sportName: string;
  state: string;
  city: string;
  athleteMember: number;
  panelMember: number;
  packageId: string;
  createdBy: string; // User ID (owner)
  teamLogoImg?: string;
  teamColor1?: string;
  teamColor2?: string;
  mascot?: string;
  unicode?: string;
  division?: string;
  conference?: string;
  expireAt?: Date;
}

/**
 * Input for updating team code
 */
export interface UpdateTeamCodeInput {
  teamName?: string;
  teamType?: TeamType | TeamTypeApi;
  sportName?: string;
  state?: string;
  city?: string;
  athleteMember?: number;
  panelMember?: number;
  isActive?: boolean;
  teamLogoImg?: string;
  teamColor1?: string;
  teamColor2?: string;
  mascot?: string;
  unicode?: string;
  division?: string;
  conference?: string;
  expireAt?: Date;
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
