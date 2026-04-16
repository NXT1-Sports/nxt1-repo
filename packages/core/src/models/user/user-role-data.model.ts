/**
 * @fileoverview User Role-Specific Data
 * @module @nxt1/core/models/user
 *
 * Role-specific data interfaces for the 3 core roles:
 * Athlete, Coach, Director
 *
 * Legacy interfaces (RecruiterData, ParentData, etc.) are kept below for
 * backward compatibility with migration scripts only — do not use in new code.
 *
 * @author NXT1 Engineering
 * @version 2.0.0
 */

import type { ParentRelationship } from '../../constants/user.constants';
import type { AcademicInfo } from './user-base.model';

// ============================================
// ATHLETE DATA
// ============================================

/**
 * @deprecated Removed in v3.0. Role-specific nested data is no longer stored
 * on the User document. `academics` lives at `user.academics` (top-level).
 * Kept here only so legacy Firestore migration scripts can still import the type.
 */
export interface AthleteData {
  /** @deprecated Use user.academics instead */
  academics?: AcademicInfo;
}

// ============================================
// COACH DATA
// ============================================

/**
 * Coach-specific data
 * For high school, club, and travel team coaches.
 */
export interface CoachData {
  /** Job title (Head Coach, Assistant Coach, etc.) */
  title: string;
  /** Years of coaching experience */
  yearsExperience?: number;
  /** Coaching certifications */
  certifications?: string[];
  /** Can manage multiple teams under one account */
  canManageMultipleTeams?: boolean;
  /** Team codes this coach manages */
  managedTeamCodes?: string[];
  /** Sports this coach is involved with */
  coachingSports?: string[];
}

// ============================================
// RECRUITER DATA (college coach, scout, recruiting service)
// ============================================

/**
 * College coach-specific data
 * @deprecated Use RecruiterData with recruiterType: 'college_coach' instead.
 * Kept for backward compatibility with existing Firestore documents.
 */
export interface CollegeCoachData extends CoachData {
  /** College/university name */
  institution: string;
  /** Athletic department */
  department?: string;
  /** Geographic recruiting regions */
  recruitingRegions?: string[];
  /** NCAA Division (D1, D2, D3) or NAIA, JUCO */
  division?: string;
  /** Conference affiliation */
  conference?: string;
}

/**
 * Recruiter-specific data (role: 'recruiter')
 * Consolidates college coaches, scouts, and recruiting services
 * into a single role with a sub-type discriminator.
 */
export interface RecruiterData {
  /** Discriminator: what kind of recruiter */
  recruiterType: 'college_coach' | 'independent_scout' | 'media_service';
  /** Job title (e.g., 'Head Coach', 'Scout', 'Recruiting Director') */
  title?: string;
  /** Organization/institution/company name */
  organization?: string;
  /** For college coaches: institution name */
  institution?: string;
  /** NCAA Division (D1, D2, D3) or NAIA, JUCO */
  division?: string;
  /** Conference affiliation */
  conference?: string;
  /** Sports they recruit for / evaluate / cover */
  sports?: string[];
  /** Geographic regions they cover */
  regions?: string[];
  /** Professional affiliations / credentials */
  affiliations?: string[];
  /** Business website (for recruiting services) */
  website?: string;
  /** Service offerings (for recruiting services) */
  services?: string[];
  /** Can manage multiple athlete clients */
  canManageAthletes?: boolean;
  /** Athlete UIDs they manage */
  managedAthleteIds?: string[];
  /** Years of experience */
  yearsExperience?: number;
}

/**
 * Scout-specific data
 * For professional scouts evaluating athletes.
 * @deprecated Use RecruiterData with recruiterType: 'independent_scout' instead.
 */
export interface ScoutData {
  /** Organization/agency name */
  organization?: string;
  /** Sports they scout */
  scoutingSports?: string[];
  /** Geographic regions they cover */
  regions?: string[];
  /** Professional affiliations */
  affiliations?: string[];
}

/**
 * Recruiting Service-specific data
 * For professional recruiting services helping athletes get recruited.
 * Similar to a scout but focused on service delivery to athletes/families.
 * @deprecated Use RecruiterData with recruiterType: 'media_service' instead.
 */
export interface RecruitingServiceData {
  /** Company/service name */
  companyName: string;
  /** Business website */
  website?: string;
  /** Sports they specialize in */
  specialtySports?: string[];
  /** Geographic regions they serve */
  serviceRegions?: string[];
  /** Service offerings (e.g., 'video editing', 'college matching', 'camp placement') */
  services?: string[];
  /** Years in business */
  yearsInBusiness?: number;
  /** Can manage multiple athlete clients */
  canManageAthletes?: boolean;
  /** Athlete UIDs they manage */
  managedAthleteIds?: string[];
}

// ============================================
// DIRECTOR DATA
// ============================================

/**
 * Director-specific data
 * For Directors, Program Directors, and administrators
 * who oversee multiple sports/programs organization-wide.
 */
export interface DirectorData {
  /** Job title (Director, Program Director, etc.) */
  title: string;
  /** Organization/school name */
  organization: string;
  /** Sports/programs they oversee (empty = all sports) */
  overseeSports?: string[];
  /** Team codes under their organization */
  organizationTeamCodes?: string[];
  /** Administrative capabilities */
  permissions?: {
    canManageCoaches?: boolean;
    canManageTeams?: boolean;
    canViewAllAthletes?: boolean;
    canManageBilling?: boolean;
  };
  /** Years in administrative role */
  yearsExperience?: number;
}

// ============================================
// PARENT DATA
// ============================================

/**
 * Parent-specific data
 * For parents/guardians managing athlete profiles.
 */
export interface ParentData {
  /** UIDs of athletes they manage */
  managedAthleteIds?: string[];
  /** Relationship to athlete(s) */
  relationship?: ParentRelationship;
}

// ============================================
// MEDIA & FAN DATA (deprecated roles)
// ============================================

/**
 * Media-specific data
 * For journalists, content creators, photographers.
 * @deprecated Removed role — kept for backward compatibility only.
 */
export interface MediaData {
  /** Media outlet/organization */
  outlet?: string;
  /** Type of media coverage */
  mediaType?: 'journalist' | 'photographer' | 'videographer' | 'blogger' | 'podcaster';
  /** Sports they cover */
  coversSports?: string[];
  /** Press credentials */
  credentials?: string;
}
