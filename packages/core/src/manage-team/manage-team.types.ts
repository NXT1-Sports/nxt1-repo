/**
 * @fileoverview Manage Team Type Definitions
 * @module @nxt1/core/manage-team
 * @version 1.0.0
 *
 * Pure TypeScript type definitions for Manage Team feature.
 * 100% portable - works on web, mobile, and backend.
 *
 * @description Comprehensive team management system with sections for
 * team info, roster, schedule, stats, staff, and sponsors.
 */

// ============================================
// MANAGE TEAM SECTION TYPES
// ============================================

/**
 * Section identifiers for manage team navigation.
 * Each section represents a collapsible editing area.
 */
export type ManageTeamSectionId =
  | 'team-info'
  | 'roster'
  | 'schedule'
  | 'stats'
  | 'staff'
  | 'sponsors';

/**
 * Tab identifiers for manage team navigation.
 */
export type ManageTeamTabId = 'overview' | 'roster' | 'schedule' | 'stats' | 'staff' | 'sponsors';

/**
 * Configuration for a manage team section.
 */
export interface ManageTeamSection {
  /** Unique section identifier */
  readonly id: ManageTeamSectionId;
  /** Display title */
  readonly title: string;
  /** Ionicons icon name */
  readonly icon: string;
  /** Section description */
  readonly description: string;
  /** Completion percentage (0-100) */
  readonly completionPercent: number;
  /** Whether section is expanded */
  readonly isExpanded?: boolean;
  /** Whether section is locked */
  readonly isLocked?: boolean;
  /** Fields in this section */
  readonly fields: readonly ManageTeamField[];
}

// ============================================
// FIELD TYPES
// ============================================

/**
 * Field types available in manage team.
 */
export type ManageTeamFieldType =
  | 'text'
  | 'textarea'
  | 'select'
  | 'multi-select'
  | 'date'
  | 'time'
  | 'datetime'
  | 'number'
  | 'phone'
  | 'email'
  | 'url'
  | 'toggle'
  | 'image-upload'
  | 'color-picker'
  | 'location'
  | 'record'
  | 'roster-list'
  | 'schedule-list'
  | 'staff-list'
  | 'sponsor-list';

/**
 * Configuration for a single team field.
 */
export interface ManageTeamField {
  /** Unique field identifier */
  readonly id: string;
  /** Field type */
  readonly type: ManageTeamFieldType;
  /** Display label */
  readonly label: string;
  /** Placeholder text */
  readonly placeholder?: string;
  /** Helper/hint text */
  readonly hint?: string;
  /** Whether field is required */
  readonly required?: boolean;
  /** Current value */
  readonly value?: unknown;
  /** Options for select/multi-select */
  readonly options?: readonly ManageTeamFieldOption[];
  /** Validation rules */
  readonly validation?: ManageTeamFieldValidation;
  /** Order within section */
  readonly order?: number;
  /** Icon for the field */
  readonly icon?: string;
}

/**
 * Option for select/multi-select fields.
 */
export interface ManageTeamFieldOption {
  readonly value: string;
  readonly label: string;
  readonly icon?: string;
  readonly disabled?: boolean;
}

/**
 * Validation rules for a field.
 */
export interface ManageTeamFieldValidation {
  readonly minLength?: number;
  readonly maxLength?: number;
  readonly min?: number;
  readonly max?: number;
  readonly pattern?: string;
  readonly patternMessage?: string;
}

// ============================================
// TEAM INFO TYPES
// ============================================

/**
 * Team basic info data.
 */
export interface TeamBasicInfo {
  readonly name: string;
  readonly mascot?: string;
  readonly abbreviation?: string;
  readonly sport: string;
  readonly level: TeamLevel;
  readonly gender: TeamGender;
  readonly season?: string;
  readonly year?: string;
}

/**
 * Team branding data.
 */
export interface TeamBranding {
  readonly logo?: string;
  readonly primaryColor: string;
  readonly secondaryColor: string;
  readonly accentColor?: string;
}

/**
 * Team contact info.
 */
export interface TeamContactInfo {
  readonly email?: string;
  readonly phone?: string;
  readonly website?: string;
  readonly address?: string;
  readonly city?: string;
  readonly state?: string;
  readonly zipCode?: string;
}

/**
 * Team record/standings.
 */
export interface TeamRecord {
  readonly wins: number;
  readonly losses: number;
  readonly ties?: number;
  readonly conferenceWins?: number;
  readonly conferenceLosses?: number;
  readonly ranking?: number;
  readonly conferenceRank?: number;
}

/**
 * Team level/division.
 */
export type TeamLevel =
  | 'youth'
  | 'middle-school'
  | 'jv'
  | 'varsity'
  | 'club'
  | 'travel'
  | 'college'
  | 'semi-pro'
  | 'professional';

/**
 * Team gender classification.
 */
export type TeamGender = 'boys' | 'girls' | 'coed';

// ============================================
// ROSTER TYPES
// ============================================

/**
 * Individual roster player entry.
 */
export interface RosterPlayer {
  readonly id: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly displayName?: string;
  readonly number?: string;
  readonly position: string;
  readonly positions?: readonly string[];
  readonly classYear?: string;
  readonly height?: string;
  readonly weight?: string;
  readonly profileImgs?: readonly string[];
  readonly profileId?: string;
  readonly email?: string;
  readonly isVerified?: boolean;
  readonly isCaptain?: boolean;
  readonly status: RosterPlayerStatus;
  readonly joinedAt?: string;
}

/**
 * Player status on roster.
 */
export type RosterPlayerStatus = 'active' | 'inactive' | 'injured' | 'pending' | 'invited';

/**
 * Roster sorting options.
 */
export type RosterSortOption = 'name' | 'number' | 'position' | 'classYear';

// ============================================
// SCHEDULE TYPES
// ============================================

/**
 * Scheduled team game/event (coach-managed).
 * Renamed from ScheduleEvent to avoid collision with the
 * athlete-level ScheduleEvent in user.model.ts.
 */
export interface TeamScheduleEvent {
  readonly id: string;
  readonly type: ScheduleEventType;
  readonly title?: string;
  readonly opponent?: string;
  readonly opponentLogo?: string;
  readonly date: string;
  readonly time?: string;
  readonly location: string;
  readonly isHome: boolean;
  readonly result?: GameResult;
  readonly notes?: string;
  readonly status: ScheduleEventStatus;
}

/**
 * Schedule event type.
 */
export type ScheduleEventType =
  | 'game'
  | 'scrimmage'
  | 'practice'
  | 'tournament'
  | 'playoff'
  | 'championship'
  | 'other';

/**
 * Game result.
 */
export interface GameResult {
  readonly teamScore: number;
  readonly opponentScore: number;
  readonly outcome: 'win' | 'loss' | 'tie';
  readonly isOvertime?: boolean;
  readonly highlights?: string;
}

/**
 * Event status.
 */
export type ScheduleEventStatus =
  | 'scheduled'
  | 'confirmed'
  | 'in-progress'
  | 'completed'
  | 'postponed'
  | 'cancelled';

// ============================================
// STAFF TYPES
// ============================================

/**
 * Staff member entry.
 */
export interface StaffMember {
  readonly id: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly displayName?: string;
  readonly role: StaffRole;
  readonly title?: string;
  readonly email?: string;
  readonly phone?: string;
  readonly profileImgs?: readonly string[];
  readonly profileId?: string;
  readonly bio?: string;
  readonly isHead?: boolean;
  readonly yearsExperience?: number;
  readonly certifications?: readonly string[];
  readonly status: StaffMemberStatus;
}

/**
 * Staff role types.
 */
export type StaffRole =
  | 'head-coach'
  | 'assistant-coach'
  | 'coordinator'
  | 'position-coach'
  | 'trainer'
  | 'manager'
  | 'statistician'
  | 'volunteer'
  | 'administrator'
  | 'other';

/**
 * Staff member status.
 */
export type StaffMemberStatus = 'active' | 'inactive' | 'pending' | 'invited';

// ============================================
// SPONSOR TYPES
// ============================================

/**
 * Team sponsor entry.
 */
export interface TeamSponsor {
  readonly id: string;
  readonly name: string;
  readonly logo?: string;
  readonly tier: SponsorTier;
  readonly website?: string;
  readonly contactName?: string;
  readonly contactEmail?: string;
  readonly contactPhone?: string;
  readonly description?: string;
  readonly startDate?: string;
  readonly endDate?: string;
  readonly amount?: number;
  readonly benefits?: readonly string[];
  readonly status: SponsorStatus;
}

/**
 * Sponsor tier levels.
 */
export type SponsorTier = 'platinum' | 'gold' | 'silver' | 'bronze' | 'supporter' | 'partner';

/**
 * Sponsor status.
 */
export type SponsorStatus = 'active' | 'pending' | 'expired' | 'cancelled';

// ============================================
// FORM DATA TYPES
// ============================================

/**
 * Complete team form data structure.
 */
export interface ManageTeamFormData {
  readonly basicInfo: TeamBasicInfo;
  readonly branding: TeamBranding;
  readonly contact: TeamContactInfo;
  readonly record: TeamRecord;
  readonly roster: readonly RosterPlayer[];
  readonly schedule: readonly TeamScheduleEvent[];
  readonly staff: readonly StaffMember[];
  readonly sponsors: readonly TeamSponsor[];
}

// ============================================
// STATE TYPES
// ============================================

/**
 * Manage team state for UI.
 */
export interface ManageTeamState {
  readonly formData: ManageTeamFormData | null;
  readonly sections: readonly ManageTeamSection[];
  readonly activeTab: ManageTeamTabId;
  readonly expandedSection: ManageTeamSectionId | null;
  readonly isLoading: boolean;
  readonly isSaving: boolean;
  readonly error: string | null;
  readonly dirtyFields: ReadonlySet<string>;
  readonly validationErrors: Readonly<Record<string, string>>;
}

/**
 * Team completion data.
 */
export interface TeamCompletionData {
  readonly percentage: number;
  readonly sectionsComplete: number;
  readonly sectionsTotal: number;
  readonly sections: readonly TeamSectionCompletion[];
}

/**
 * Section completion data.
 */
export interface TeamSectionCompletion {
  readonly sectionId: ManageTeamSectionId;
  readonly percentage: number;
  readonly isComplete: boolean;
  readonly fieldsCompleted: number;
  readonly fieldsTotal: number;
}

// ============================================
// EVENT TYPES
// ============================================

/**
 * Field change event from manage team form.
 */
export interface ManageTeamFieldChangeEvent {
  readonly sectionId: ManageTeamSectionId;
  readonly fieldId: string;
  readonly value: unknown;
  readonly previousValue?: unknown;
}

/**
 * Roster action event.
 */
export interface RosterActionEvent {
  readonly action: 'add' | 'edit' | 'remove' | 'invite' | 'view-profile';
  readonly playerId?: string;
  readonly player?: RosterPlayer;
}

/**
 * Schedule action event.
 */
export interface ScheduleActionEvent {
  readonly action: 'add' | 'edit' | 'remove' | 'view-details';
  readonly eventId?: string;
  readonly event?: TeamScheduleEvent;
}

/**
 * Staff action event.
 */
export interface StaffActionEvent {
  readonly action: 'add' | 'edit' | 'remove' | 'invite' | 'view-profile';
  readonly staffId?: string;
  readonly staff?: StaffMember;
}

/**
 * Sponsor action event.
 */
export interface SponsorActionEvent {
  readonly action: 'add' | 'edit' | 'remove' | 'view-details';
  readonly sponsorId?: string;
  readonly sponsor?: TeamSponsor;
}
