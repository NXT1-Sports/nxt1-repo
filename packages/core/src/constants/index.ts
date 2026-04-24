/**
 * @fileoverview Constants Barrel Export
 * @module @nxt1/core/constants
 *
 * Central export point for all constants.
 * 100% portable - no framework dependencies.
 *
 * NOTE: We use explicit exports to avoid duplicate symbol conflicts
 *
 * @author NXT1 Engineering
 * @version 2.0.0
 */

// App configuration
export * from './app.constants';

// User constants
export * from './user.constants';

// Payment constants (subscriptions, products, transactions)
export * from './payment.constants';

// Validation constants
export * from './validation.constants';

// API constants
export * from './api.constants';

// Posts constants
export * from './posts.constants';

// User analytics constants (stored engagement data - profile views, traffic sources, etc.)
export * from './user-analytics.constants';

// Sport constants (single source of truth)
export {
  SPORT_IDS,
  type SportId,
  SPORTS,
  type SportName,
  type FieldDefinition,
  type StatCategory,
  type SportCell,
  type Sport,
  type SportsMap,
  SPORT_POSITIONS,
  POSITION_ABBREVIATIONS,
  POSITION_MAPPING_BY_SPORT,
  SPORT_STATS,
  ATHLETIC_INFO_FIELDS,
  formatSportDisplayName,
  normalizeSportKey,
  formatPositionDisplay,
  DEFAULT_SPORTS,
  SPORT_EMOJI_MAP,
  getSportEmoji,
  SPORTS_COLLECTION,
  ACADEMIC_CATEGORIES_COLLECTION,
  type PositionGroup,
  SPORT_POSITION_GROUPS,
  DEFAULT_POSITION_GROUPS,
  getPositionGroupsForSport,
  getPositionsForSport,
  getAthleticInfoForSport,
  getStatsForSport,
  getPositionAbbreviation,
  getRequiredAthleticInfo,
  isValidSport,
  getAllSports,
} from './sport.constants';

// Location constants (states, countries)
export * from './location.constants';

// Recruiting constants (NCAA calendars, divisions)
export * from './recruiting.constants';

// Auth constants (storage keys, routes, error messages)
export * from './auth.constants';

// Notification constants (push, email, SMS types and categories)
export * from './notification.constants';

// Storage constants (Firebase Storage paths, sizes, formats)
export * from './storage.constants';

// Legal content (About, Terms, Privacy - shared between web and mobile)
export * from './legal-content';

// Legal URLs (Termly-hosted Terms & Privacy links)
export * from './legal-urls';

// Schema version constants (migration tracking)
export * from './schema.constants';

// Campaign constants (email campaigns, templates)
// NOTE: EMAIL_PROVIDERS and EmailProvider excluded — already exported from user.constants.
// The campaign-specific version (with 'system') is available via @nxt1/core/models.
export {
  CAMPAIGN_STATUSES,
  type CampaignStatus,
  RECIPIENT_STATUSES,
  type RecipientStatus,
  TEMPLATE_TYPES,
  type TemplateType,
  CAMPAIGN_LIMITS,
  TEMPLATE_VARIABLES,
  type TemplateVariable,
} from './campaign.constants';

// Media constants (media library, storage limits)
export * from './media.constants';

// Navigation constants (footer, top nav, sidenav)
export * from './navigation.constants';
