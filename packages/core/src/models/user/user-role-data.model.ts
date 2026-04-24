/**
 * @fileoverview User Role-Specific Data
 * @module @nxt1/core/models/user
 *
 * Role-specific data interfaces for the supported team-management roles.
 *
 * @author NXT1 Engineering
 * @version 2.0.0
 */

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
