/**
 * @fileoverview Intel Module Barrel Export
 * @module @nxt1/core/intel
 *
 * AI-generated intelligence reports for athlete and team profiles.
 * Agent X is the athlete's advocate — it tells their story, not their score.
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
  // Intel Report section types
  type IntelBriefItem,
  type IntelBriefSection,
  // Athlete types
  type AthleteIntelReport,
  // Team types
  type TeamIntelReport,
  // API response types
  type IntelReportResponse,
  type IntelGenerateResponse,
} from './intel.types';

// ============================================
// INTEL API
// ============================================
export { createIntelApi, type IntelApi } from './intel.api';
