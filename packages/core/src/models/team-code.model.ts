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
  division?: string;
  conference?: string;
  seasonRecord?: {
    wins?: number | null;
    losses?: number | null;
    ties?: number | null;
  };
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
