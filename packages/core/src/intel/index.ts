/**
 * @fileoverview Intel Module Barrel Export
 * @module @nxt1/core/intel
 *
 * AI-generated intelligence reports for athlete and team profiles.
 * 100% portable — NO platform dependencies.
 */

// ============================================
// INTEL TYPES
// ============================================
export {
  // Shared types
  type IntelDataSource,
  type IntelCitation,
  type IntelReportStatus,
  type IntelDataAvailability,
  type IntelMissingDataPrompt,
  type IntelQuickCommand,
  // Athlete types
  type IntelScoutRatings,
  type IntelTierClassification,
  type IntelPercentileRankings,
  type IntelLevelProjections,
  type IntelMeasurableHighlight,
  type IntelStatHighlight,
  type IntelRecruitingSummary,
  type AthleteIntelReport,
  // Team types
  type IntelRosterProspect,
  type IntelSeasonSummary,
  type TeamIntelReport,
  // API response types
  type IntelReportResponse,
  type IntelGenerateResponse,
} from './intel.types';

// ============================================
// INTEL API
// ============================================
export { createIntelApi, type IntelApi } from './intel.api';
