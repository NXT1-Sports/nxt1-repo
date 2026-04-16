/**
 * @fileoverview Intel Report Type Definitions
 * @module @nxt1/core/intel
 *
 * AI-generated intelligence reports for athlete and team profiles.
 * Agent X is the athlete's advocate — it tells their story, not their score.
 * Pre-generated on-demand via Agent X and stored in Firestore.
 *
 * 100% portable — NO platform dependencies.
 */

// ============================================
// SHARED INTEL TYPES
// ============================================

/** How a specific data point was sourced / verified. */
export type IntelDataSource =
  | 'self-reported'
  | 'coach-verified'
  | 'maxpreps'
  | 'hudl'
  | '247sports'
  | 'rivals'
  | 'on3'
  | 'perfect-game'
  | 'prep-baseball'
  | 'ncsa'
  | 'usa-football'
  | 'agent-x';

/** A single citation referencing where a data point came from. */
export interface IntelCitation {
  readonly platform: IntelDataSource;
  readonly label: string;
  readonly url?: string;
  readonly lastSyncedAt?: string;
  /** True when the source is a verified third-party platform (not self-reported). */
  readonly verified?: boolean;
}

/** Lifecycle status of an intel report. */
export type IntelReportStatus = 'none' | 'processing' | 'ready' | 'error';

/** What data categories are available vs missing. */
export interface IntelDataAvailability {
  readonly hasMetrics: boolean;
  readonly hasStats: boolean;
  readonly hasGameLogs: boolean;
  readonly hasRecruiting: boolean;
  readonly hasSchedule: boolean;
  readonly hasAcademics: boolean;
  readonly hasVideo: boolean;
  readonly hasAwards: boolean;
}

/** A data-collection prompt rendered when key data is missing. */
export interface IntelMissingDataPrompt {
  readonly category: keyof IntelDataAvailability;
  readonly title: string;
  readonly description: string;
  readonly actionLabel: string;
  readonly actionRoute: string;
  readonly icon: string;
}

/** An actionable Quick Command surfaced at the bottom of the report. */
export interface IntelQuickCommand {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly icon: string;
  readonly agentPrompt: string;
}

// ============================================
// INTEL REPORT SECTION TYPES
// ============================================

/**
 * A single key data point within a Intel report section.
 * Used for structured grids (measurements, stats, academic info, etc.)
 */
export interface IntelBriefItem {
  readonly label: string;
  readonly value: string;
  readonly unit?: string;
  /** Which source/platform provided this data point. */
  readonly source?: IntelDataSource;
  /** True when the data point comes from a verified third-party platform. */
  readonly verified?: boolean;
  readonly date?: string;
  readonly sublabel?: string;
}

/**
 * A named section within an Agent X Intel report report.
 * Each section has a markdown narrative (`content`) and optional structured
 * key-value items (`items`). Agent X renders one section per side-tab.
 */
export interface IntelBriefSection {
  /** Canonical section identifier (e.g. 'agent_x_brief', 'season_stats'). */
  readonly id: string;
  readonly title: string;
  readonly icon: string;
  /** Primary narrative content — markdown prose from Agent X. */
  readonly content: string;
  /** Optional structured data items shown as a grid below the narrative. */
  readonly items?: readonly IntelBriefItem[];
  /** Citations specific to this section. */
  readonly sources?: readonly IntelCitation[];
}

// ============================================
// ATHLETE INTEL REPORT
// ============================================

/** The complete athlete Intel Intel report stored in Firestore. */
export interface AthleteIntelReport {
  readonly id: string;
  readonly userId: string;
  readonly sportName: string;
  readonly primaryPosition: string;
  readonly status: IntelReportStatus;

  // ── Intel Report Sections (Agent X narrative + structured data) ──
  readonly sections: readonly IntelBriefSection[];

  // ── Provenance ──
  readonly citations: readonly IntelCitation[];
  readonly missingDataPrompts: readonly IntelMissingDataPrompt[];

  // ── Quick Commands ──
  readonly quickCommands: readonly IntelQuickCommand[];

  // ── Metadata ──
  readonly generatedAt: string;
  readonly generatedBy: 'agent-x';
  readonly modelUsed?: string;
  /** ISO timestamp after which the report should prompt regeneration (30-day TTL). */
  readonly staleAt?: string;
}

// ============================================
// TEAM INTEL REPORT
// ============================================

/** The complete team Intel Intel report stored in Firestore. */
export interface TeamIntelReport {
  readonly id: string;
  readonly teamId: string;
  readonly teamName: string;
  readonly sport: string;
  readonly status: IntelReportStatus;

  // ── Intel Report Sections (Agent X narrative + structured data) ──
  readonly sections: readonly IntelBriefSection[];

  // ── Provenance ──
  readonly citations: readonly IntelCitation[];
  readonly missingDataPrompts: readonly IntelMissingDataPrompt[];

  // ── Quick Commands ──
  readonly quickCommands: readonly IntelQuickCommand[];

  // ── Metadata ──
  readonly generatedAt: string;
  readonly generatedBy: 'agent-x';
  readonly modelUsed?: string;
  /** ISO timestamp after which the report should prompt regeneration (30-day TTL). */
  readonly staleAt?: string;
}

// ============================================
// API TYPES
// ============================================

/** Response when fetching an Intel report. */
export interface IntelReportResponse<T extends AthleteIntelReport | TeamIntelReport> {
  readonly success: boolean;
  readonly data: T | null;
  readonly error?: string;
}

/** Response when triggering Intel generation. */
export interface IntelGenerateResponse<
  T extends AthleteIntelReport | TeamIntelReport = AthleteIntelReport,
> {
  readonly success: boolean;
  readonly status: IntelReportStatus;
  readonly message: string;
  readonly reportId?: string;
  readonly data?: T;
  readonly error?: string;
}
