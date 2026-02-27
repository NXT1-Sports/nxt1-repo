/**
 * @fileoverview Team Profile Module Barrel Export
 * @module @nxt1/core/team-profile
 * @version 1.0.0
 *
 * Public-facing team profile pure TypeScript code.
 * 100% portable — NO platform dependencies.
 *
 * @example
 * ```typescript
 * // Root barrel
 * import { TeamProfilePageData, createTeamProfileApi, TEAM_PROFILE_TABS } from '@nxt1/core';
 *
 * // Sub-path (also valid)
 * import { TeamProfilePageData, TEAM_PROFILE_TABS } from '@nxt1/core/team-profile';
 * ```
 */

// ============================================
// TEAM PROFILE TYPES
// ============================================
export {
  // Tab types
  type TeamProfileTabId,
  type TeamProfileTab,
  // Team identity types
  type TeamProfileType,
  type TeamProfileBranding,
  type TeamProfileSocialLink,
  type TeamProfileContact,
  type TeamProfileLinks,
  type TeamProfileSponsor,
  // Core team entity
  type TeamProfileTeam,
  type TeamProfileRecord,
  // Roster types
  type TeamProfileRosterMember,
  type TeamProfileRosterSortOption,
  // Schedule types
  type TeamProfileScheduleEvent,
  type TeamProfileGameResult,
  // Stats types
  type TeamProfileStat,
  type TeamProfileStatsCategory,
  // Staff types
  type TeamProfileStaffMember,
  // Recruiting types
  type TeamProfileRecruitingActivity,
  // Social types
  type TeamProfileFollowStats,
  // Analytics types
  type TeamProfileQuickStats,
  // Content types
  type TeamProfilePostType,
  type TeamProfilePost,
  // Header types
  type TeamProfileHeaderAction,
  // Response types
  type TeamProfilePageData,
  // Re-exported verification types
  type VerificationStatus,
  type DataVerification,
} from './team-profile.types';

// ============================================
// TEAM PROFILE CONSTANTS
// ============================================
export {
  // Tabs
  TEAM_PROFILE_TABS,
  TEAM_PROFILE_DEFAULT_TAB,
  TEAM_PROFILE_VERIFICATION_HIDDEN_TABS,
  // Post types
  TEAM_PROFILE_POST_TYPE_ICONS,
  TEAM_PROFILE_POST_TYPE_LABELS,
  // Roster
  TEAM_PROFILE_ROSTER_SORT_LABELS,
  // Team types
  TEAM_PROFILE_TYPE_LABELS,
  TEAM_PROFILE_TYPE_ICONS,
  // Quick stats
  TEAM_PROFILE_QUICK_STATS_CONFIG,
  // Header actions
  TEAM_PROFILE_ADMIN_HEADER_ACTIONS,
  TEAM_PROFILE_VISITOR_HEADER_ACTIONS,
  // Empty states
  TEAM_PROFILE_EMPTY_STATES,
  // UI config
  TEAM_PROFILE_UI_CONFIG,
  // Cache
  TEAM_PROFILE_CACHE_KEYS,
} from './team-profile.constants';

// ============================================
// TEAM PROFILE API
// ============================================
export {
  createTeamProfileApi,
  type TeamProfileApi,
  type TeamProfileApiResponse,
  type TeamProfilePaginatedResponse,
  type TeamProfileSearchParams,
} from './team-profile.api';
