/**
 * @fileoverview Intel Report Type Definitions
 * @module @nxt1/core/intel
 *
 * AI-generated intelligence reports for athlete and team profiles.
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
// ATHLETE INTEL REPORT
// ============================================

/** AI-generated four-pillar scout ratings (0–99 scale). */
export interface IntelScoutRatings {
  readonly physical: number;
  readonly technical: number;
  readonly mental: number;
  readonly potential: number;
}

/** Prospect tier classification. */
export type IntelTierClassification = 'Elite' | 'Premium' | 'Rising' | 'Developing' | 'On Radar';

/** Percentile-based rankings vs peers. */
export interface IntelPercentileRankings {
  readonly overall: number;
  readonly position: number;
  readonly state: number;
  readonly measurableFit: number;
}

/** Level projection probabilities (0-100). */
export interface IntelLevelProjections {
  readonly d1: number;
  readonly d2: number;
  readonly d3: number;
  readonly naia: number;
  readonly juco: number;
}

/** A single highlighted measurable from the report. */
export interface IntelMeasurableHighlight {
  readonly label: string;
  readonly value: string;
  readonly unit?: string;
  readonly percentile?: number;
  readonly source: IntelDataSource;
  readonly trend?: 'up' | 'down' | 'stable';
}

/** A single season stat highlight from the report. */
export interface IntelStatHighlight {
  readonly label: string;
  readonly value: string;
  readonly season: string;
  readonly category: string;
  readonly source: IntelDataSource;
}

/** A recruiting activity summary item. */
export interface IntelRecruitingSummary {
  readonly totalOffers: number;
  readonly totalVisits: number;
  readonly totalCamps: number;
  readonly topDivision: string;
  readonly topPrograms: string[];
  readonly narrative: string;
}

/** The complete athlete Intel report stored in Firestore. */
export interface AthleteIntelReport {
  readonly id: string;
  readonly userId: string;
  readonly sportName: string;
  readonly primaryPosition: string;
  readonly status: IntelReportStatus;

  // ── AI-Generated Content ──
  readonly overallScore: number;
  readonly tierClassification: IntelTierClassification;
  readonly ratings: IntelScoutRatings;
  readonly percentileRankings: IntelPercentileRankings;
  readonly levelProjections: IntelLevelProjections;

  readonly aiBrief: string;
  readonly strengths: readonly string[];
  readonly areasForImprovement: readonly string[];

  // ── Highlighted Data ──
  readonly measurableHighlights: readonly IntelMeasurableHighlight[];
  readonly statHighlights: readonly IntelStatHighlight[];
  readonly recruitingSummary: IntelRecruitingSummary | null;

  // ── Provenance ──
  readonly dataAvailability: IntelDataAvailability;
  readonly citations: readonly IntelCitation[];
  readonly missingDataPrompts: readonly IntelMissingDataPrompt[];

  // ── Quick Commands ──
  readonly quickCommands: readonly IntelQuickCommand[];

  // ── Metadata ──
  readonly generatedAt: string;
  readonly generatedBy: 'agent-x';
  readonly modelUsed?: string;
}

// ============================================
// TEAM INTEL REPORT
// ============================================

/** A highlighted prospect on the team roster. */
export interface IntelRosterProspect {
  readonly userId: string;
  readonly name: string;
  readonly position: string;
  readonly classYear: string;
  readonly overallScore: number;
  readonly tierClassification: IntelTierClassification;
  readonly profileCode?: string;
}

/** Historical season summary for the team. */
export interface IntelSeasonSummary {
  readonly season: string;
  readonly record: string;
  readonly highlights: readonly string[];
  readonly conference?: string;
}

/** The complete team Intel report stored in Firestore. */
export interface TeamIntelReport {
  readonly id: string;
  readonly teamId: string;
  readonly teamName: string;
  readonly sport: string;
  readonly status: IntelReportStatus;

  // ── AI-Generated Content ──
  readonly seasonOutlook: string;
  readonly teamIdentity: string;
  readonly strengths: readonly string[];
  readonly areasForImprovement: readonly string[];

  // ── Roster Intelligence ──
  readonly topProspects: readonly IntelRosterProspect[];
  readonly rosterDepthSummary: string;
  readonly classBreakdown: Record<string, number>;

  // ── Historical Performance ──
  readonly seasonHistory: readonly IntelSeasonSummary[];
  readonly overallRecord: string;
  readonly historicalNarrative: string;

  // ── Program Info ──
  readonly recruitingPipeline: string;
  readonly competitiveAnalysis: string;

  // ── Provenance ──
  readonly citations: readonly IntelCitation[];
  readonly missingDataPrompts: readonly IntelMissingDataPrompt[];

  // ── Quick Commands ──
  readonly quickCommands: readonly IntelQuickCommand[];

  // ── Metadata ──
  readonly generatedAt: string;
  readonly generatedBy: 'agent-x';
  readonly modelUsed?: string;
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
