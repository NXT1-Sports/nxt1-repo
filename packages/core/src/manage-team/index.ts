/**
 * @fileoverview Manage Team Module - Barrel Export
 * @module @nxt1/core/manage-team
 * @version 1.0.0
 *
 * Public API for the Manage Team core module.
 * 100% portable - works on web, mobile, and backend.
 *
 * @example
 * ```typescript
 * import {
 *   ManageTeamFormData,
 *   RosterPlayer,
 *   createManageTeamApi,
 *   MANAGE_TEAM_SECTIONS,
 * } from '@nxt1/core';
 * ```
 */

// ============================================
// TYPES
// ============================================

export type {
  // Section types
  ManageTeamSectionId,
  ManageTeamTabId,
  ManageTeamSection,
  ManageTeamField,
  ManageTeamFieldType,
  ManageTeamFieldOption,
  ManageTeamFieldValidation,
  // Team info types
  TeamBasicInfo,
  TeamBranding,
  TeamContactInfo,
  TeamRecord,
  TeamLevel,
  TeamGender,
  // Roster types
  RosterPlayer,
  RosterPlayerStatus,
  RosterSortOption,
  // Schedule types
  TeamScheduleEvent,
  ScheduleEventType,
  GameResult,
  ScheduleEventStatus,
  // Staff types
  StaffMember,
  StaffRole,
  StaffMemberStatus,
  // Sponsor types
  TeamSponsor,
  SponsorTier,
  SponsorStatus,
  // Form/State types
  ManageTeamFormData,
  ManageTeamState,
  TeamCompletionData,
  TeamSectionCompletion,
  // Event types
  ManageTeamFieldChangeEvent,
  RosterActionEvent,
  ScheduleActionEvent,
  StaffActionEvent,
  SponsorActionEvent,
} from './manage-team.types';

// ============================================
// CONSTANTS
// ============================================

export {
  MANAGE_TEAM_SECTIONS,
  MANAGE_TEAM_TABS,
  SPONSOR_TIER_CONFIG,
  STAFF_ROLE_CONFIG,
  TEAM_LEVEL_CONFIG,
  getManageTeamSection,
  getAllManageTeamSections,
  getSponsorTierConfig,
  getStaffRoleConfig,
  getTeamLevelConfig,
} from './manage-team.constants';

// ============================================
// API
// ============================================

export { createManageTeamApi, type ManageTeamApi } from './manage-team.api';
