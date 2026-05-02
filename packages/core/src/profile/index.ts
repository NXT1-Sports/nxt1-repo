/**
 * @fileoverview Profile Module Barrel Export
 * @module @nxt1/core/profile
 *
 * Profile-related pure TypeScript code.
 * 100% portable - NO platform dependencies.
 *
 * @version 2.0.0
 */

// ============================================
// PROFILE TYPES
// ============================================
export {
  // Tab types
  type ProfileTabId,
  type ProfileTab,
  // User types
  type ProfileUserRole,
  type VerificationStatus,
  type ProfileSport,
  type ProfileTeamType,
  type ProfileTeamAffiliation,
  type ProfileSchool,
  type ProfileSocialLink,
  type ProfileSocialLinks,
  type ProfileConnectedSource,
  type ProfileContact,
  type ProfileAward,
  type ProfileCoachContact,
  type ProfileUser,
  // Analytics types
  type ProfileQuickStats,
  type ProfileStatItem,
  type AthleticStat,
  type AthleticStatsCategory,
  // Game log types (MaxPreps-style)
  type GameLogColumn,
  type GameLogEntry,
  type GameLogSeasonTotals,
  type ProfileSeasonGameLog,
  // Content types
  type ProfilePostType,
  type ProfilePost,
  type ProfilePinnedVideo,
  // Timeline filter types
  type ProfileTimelineFilterId,
  type ProfileTimelineFilter,
  // Recruiting activity (2026 unified architecture)
  type ProfileRecruitingActivity,
  type ProfileRecruitingCategory,
  // @deprecated — use ProfileRecruitingActivity instead
  type OfferType,
  type ProfileOffer,
  type EventType,
  type ProfileEvent,
  // Schedule board display types
  type ScheduleRow,
  // Edit types
  type ProfileEditSection,
  type ProfileEditData,
  // Header types
  type ProfileHeaderAction,
  // Response types
  type ProfilePageData,
  // Player Card types (Agent X / Madden-style)
  type ProspectTier,
  type ProspectGrade,
  type PlayerArchetype,
  type AgentXTraitCategory,
  type AgentXTrait,
  type PlayerCardData,
  // Verification helpers (pure functions)
  getVerification,
  getAllVerifications,
} from './profile.types';

// ============================================
// PROFILE CONSTANTS
// ============================================
export {
  // Tabs
  PROFILE_TABS,
  PROFILE_DEFAULT_TAB,
  PROFILE_VERIFICATION_HIDDEN_TABS,
  // Role-aware tab helpers
  getProfileTabsForUser,
  getOverviewSectionLabels,
  // Timeline filters
  PROFILE_TIMELINE_FILTERS,
  PROFILE_TIMELINE_DEFAULT_FILTER,
  // Post types
  PROFILE_POST_TYPE_ICONS,
  PROFILE_POST_TYPE_LABELS,
  // Offer types
  OFFER_TYPE_ICONS,
  OFFER_TYPE_LABELS,
  OFFER_TYPE_COLORS,
  // Recruiting categories
  RECRUITING_CATEGORY_ICONS,
  RECRUITING_CATEGORY_LABELS,
  // Event types
  EVENT_TYPE_ICONS,
  EVENT_TYPE_LABELS,
  // Quick stats
  PROFILE_QUICK_STATS_CONFIG,
  // Header actions
  PROFILE_OWN_HEADER_ACTIONS,
  PROFILE_OTHER_HEADER_ACTIONS,
  // Empty states
  PROFILE_EMPTY_STATES,
  // UI config
  PROFILE_UI_CONFIG,
  // Validation
  PROFILE_VALIDATION,
  // Cache
  PROFILE_CACHE_KEYS,
  // Verification scope mapper
  getVerificationScopesForTab,
} from './profile.constants';

// ============================================
// CONNECTED SOURCES HELPERS
// ============================================
export {
  mapToConnectedSources,
  mapConnectedSourcesToLinkSources,
  mapFirebaseProvidersToLinkSources,
  mapConnectedEmailsToLinkSources,
  mergeLinkSources,
  buildLinkSourcesFormData,
  connectedSourceKey,
  mergeConnectedSources,
} from './connected-sources.helpers';

// ============================================
// PROFILE SCHEDULE HELPERS
// ============================================
export {
  mapProfileEventsToScheduleRows,
  filterScheduleEvents,
  getScheduleSeasons,
  getSeasonForDate,
  type ProfileScheduleContext,
} from './profile-schedule.helpers';

// ============================================
// PROFILE API
// ============================================
export {
  // Factory
  createProfileApi,
  type ProfileApi,
  // Types
  type AddSportResponse,
  type ApiResponse,
  type PaginatedResponse,
  type UpdateProfileRequest,
  type UpdateSportProfileRequest,
  type ProfileSearchParams,
  type ProfileAnalytics,
} from './profile.api';
