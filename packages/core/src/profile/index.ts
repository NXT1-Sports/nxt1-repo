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
  type ProfileSocialLinks,
  type ProfileContact,
  type ProfileAward,
  type ProfileCoachContact,
  type ProfileUser,
  // Social types
  type ProfileFollowStats,
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
  // Offer types
  type OfferType,
  type ProfileOffer,
  // Event types
  type EventType,
  type ProfileEvent,
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
} from './profile.types';

// ============================================
// PROFILE CONSTANTS
// ============================================
export {
  // Tabs
  PROFILE_TABS,
  PROFILE_DEFAULT_TAB,
  PROFILE_VERIFICATION_HIDDEN_TABS,
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
} from './profile.constants';

// ============================================
// PROFILE API
// ============================================
export {
  // Factory
  createProfileApi,
  type ProfileApi,
  // Types
  type ApiResponse,
  type PaginatedResponse,
  type UpdateProfileRequest,
  type UpdateSportProfileRequest,
  type ProfileSearchParams,
  type FollowResponse,
  type ProfileAnalytics,
} from './profile.api';
