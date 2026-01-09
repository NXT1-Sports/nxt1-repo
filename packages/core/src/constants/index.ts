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

// Validation constants
export * from './validation.constants';

// API constants
export * from './api.constants';

// Analytics constants
export * from './analytics.constants';

// Sport constants (legacy) - export only unique symbols not in sport-config
export {
  type SportCell,
  type Sport,
  type SportsMap,
  formatSportDisplayName,
  POSITION_MAPPING_BY_SPORT,
  POSITION_ABBREVIATIONS,
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
} from './sport.constants';

// Sport configuration - newer, more complete (preferred)
// Note: normalizeSportKey and getPositionsForSport are in both files - use sport-config version
export {
  SPORT_IDS,
  type SportId,
  SPORTS,
  type SportName,
  type FieldDefinition,
  type StatCategory,
  SPORT_POSITIONS,
  ATHLETIC_INFO_FIELDS,
  SPORT_STATS,
  normalizeSportKey,
  getPositionsForSport,
  getAthleticInfoForSport,
  getStatsForSport,
  getPositionAbbreviation,
  getRequiredAthleticInfo,
  isValidSport,
  getAllSports,
} from './sport-config.constants';

// Location constants (states, countries)
export * from './location.constants';

// Recruiting constants (NCAA calendars, divisions)
export * from './recruiting.constants';

// Auth constants (storage keys, routes, error messages)
export * from './auth.constants';


