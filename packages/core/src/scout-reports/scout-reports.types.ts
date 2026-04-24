/**
 * @fileoverview Scout Reports Type Definitions
 * @module @nxt1/core/scout-reports
 * @version 1.0.0
 *
 * Pure TypeScript type definitions for Scout Reports feature.
 * 100% portable - works on web, mobile, and backend.
 *
 * Scout Reports allow coaches, scouts, and verified users to evaluate
 * and rate athletes across physical, technical, mental, and potential metrics.
 */

// ============================================
// REPORT CATEGORY TYPES
// ============================================

/**
 * Report category identifiers.
 * Each category represents a filtered view of scout reports.
 */
export type ScoutReportCategoryId =
  | 'all'
  | 'trending'
  | 'top-rated'
  | 'recent'
  | 'by-sport'
  | 'class-2026'
  | 'class-2027'
  | 'class-2028'
  | 'saved';

/**
 * Configuration for a report category tab.
 */
export interface ScoutReportCategory {
  /** Unique category identifier */
  readonly id: ScoutReportCategoryId;
  /** Display label */
  readonly label: string;
  /** Ionicons icon name */
  readonly icon: string;
  /** Badge count (new reports in category) */
  readonly badge?: number;
  /** Whether category is currently disabled */
  readonly disabled?: boolean;
}

// ============================================
// RATING TYPES
// ============================================

/**
 * Rating tier classification based on overall rating.
 */
export type RatingTier = 'elite' | 'excellent' | 'good' | 'average' | 'developing';

/**
 * Individual rating breakdown for a scout report.
 * All values are on a 1-5 scale with 0.1 precision.
 */
export interface ScoutRating {
  /** Overall composite rating (1.0 - 5.0) */
  readonly overall: number;
  /** Physical attributes rating (1.0 - 5.0) */
  readonly physical: number;
  /** Technical skills rating (1.0 - 5.0) */
  readonly technical: number;
  /** Mental/IQ rating (1.0 - 5.0) */
  readonly mental: number;
  /** Future potential rating (1.0 - 5.0) */
  readonly potential: number;
}

/**
 * Rating comparison data for context.
 */
export interface RatingComparison {
  /** Class average for this position */
  readonly classAverage: number;
  /** Percentile within class (0-100) */
  readonly percentile: number;
  /** Rank within position group */
  readonly positionRank?: number;
  /** Total athletes in position group */
  readonly positionTotal?: number;
}

// ============================================
// ATHLETE TYPES
// ============================================

/**
 * Sport type for athletes.
 */
export type AthleteSport =
  | 'football'
  | 'basketball'
  | 'baseball'
  | 'softball'
  | 'soccer'
  | 'volleyball'
  | 'track'
  | 'swimming'
  | 'wrestling'
  | 'lacrosse'
  | 'hockey'
  | 'tennis'
  | 'golf'
  | 'gymnastics'
  | 'other';

/**
 * Athletic stats that can be displayed.
 * Sport-specific stats are optional.
 */
export interface AthleteStats {
  /** Height (e.g., "6'2\"") */
  readonly height?: string;
  /** Weight (e.g., "185 lbs") */
  readonly weight?: string;
  /** 40-yard dash time (e.g., "4.5s") */
  readonly fortyYard?: string;
  /** Vertical jump (e.g., "36\"") */
  readonly vertical?: string;
  /** GPA (e.g., "3.8") */
  readonly gpa?: string;
  /** Shuttle time */
  readonly shuttle?: string;
  /** Broad jump */
  readonly broadJump?: string;
  /** Bench press reps */
  readonly benchPress?: string;
  /** Sport-specific stats */
  readonly sportSpecific?: Record<string, string>;
}

/**
 * Athlete profile information for scout reports.
 */
export interface ScoutReportAthlete {
  /** Unique athlete ID */
  readonly id: string;
  /** Full name */
  readonly name: string;
  /** Primary position */
  readonly position: string;
  /** Secondary position (if any) */
  readonly secondaryPosition?: string;
  /** Primary sport */
  readonly sport: AthleteSport;
  /** Graduation year */
  readonly gradYear: number;
  /** Profile photo URL */
  readonly photoUrl?: string;
  /** School/Team name */
  readonly school?: string;
  /** City, State location */
  readonly location?: string;
  /** State abbreviation */
  readonly state?: string;
  /** Athletic stats */
  readonly stats?: AthleteStats;
  /** Whether profile is verified */
  readonly isVerified?: boolean;
  /** Social media handles */
  readonly social?: {
    readonly twitter?: string;
    readonly instagram?: string;
  };
}

// ============================================
// SCOUT REPORT TYPES
// ============================================

/**
 * Scout/Evaluator information.
 */
export interface ScoutInfo {
  /** Scout user ID */
  readonly id: string;
  /** Display name */
  readonly name: string;
  /** Avatar URL */
  readonly avatarUrl?: string;
  /** Title/Role */
  readonly title?: string;
  /** Organization/School */
  readonly organization?: string;
  /** Whether scout is verified */
  readonly isVerified?: boolean;
  /** Scout tier/level */
  readonly tier?: 'scout' | 'coach' | 'verified' | 'official';
}

/**
 * Video clip associated with a scout report.
 */
export interface ScoutReportVideoClip {
  /** Unique clip ID */
  readonly id: string;
  /** Video URL */
  readonly url: string;
  /** Thumbnail URL */
  readonly thumbnailUrl?: string;
  /** Duration in seconds */
  readonly duration?: number;
  /** Caption/title */
  readonly caption?: string;
  /** Start timestamp for highlight */
  readonly startTime?: number;
}

/**
 * Complete scout report entity.
 */
export interface ScoutReport {
  /** Unique report ID */
  readonly id: string;

  /** Athlete being evaluated */
  readonly athlete: ScoutReportAthlete;

  /** Rating breakdown */
  readonly rating: ScoutRating;

  /** Rating comparison context */
  readonly comparison?: RatingComparison;

  /** Short summary of evaluation */
  readonly summary: string;

  /** Detailed evaluation text */
  readonly detailedAnalysis?: string;

  /** Key strengths/highlights */
  readonly highlights: string[];

  /** Areas for improvement */
  readonly concerns: string[];

  /** Associated video clips */
  readonly videoClips?: ScoutReportVideoClip[];

  /** Scout/Evaluator info */
  readonly scout: ScoutInfo;

  /** Whether report is from verified scout */
  readonly isVerified: boolean;

  /** Total view count */
  readonly viewCount: number;

  /** Publication timestamp (ISO string) */
  readonly publishedAt: string;

  /** Last updated timestamp (ISO string) */
  readonly updatedAt?: string;

  /** XP reward for viewing this report */
  readonly xpReward: number;

  /** Whether user has viewed (for XP tracking) */
  readonly hasViewed?: boolean;

  /** Tags for categorization */
  readonly tags?: string[];

  /** Report source (where published from) */
  readonly source?: 'nxt1' | 'partner' | 'official';
}

// ============================================
// FILTER TYPES
// ============================================

/**
 * Sort options for scout reports.
 */
export type ScoutReportSortBy = 'rating' | 'recent' | 'views' | 'name' | 'gradYear' | 'trending';

/**
 * Sort direction.
 */
export type SortOrder = 'asc' | 'desc';

/**
 * Filter criteria for scout reports.
 */
export interface ScoutReportFilter {
  /** Filter by category */
  readonly category?: ScoutReportCategoryId;
  /** Filter by sport(s) */
  readonly sports?: AthleteSport[];
  /** Filter by position(s) */
  readonly positions?: string[];
  /** Filter by graduation year(s) */
  readonly gradYears?: number[];
  /** Minimum rating threshold */
  readonly minRating?: number;
  /** Filter verified reports only */
  readonly verifiedOnly?: boolean;
  /** Filter by state(s) */
  readonly states?: string[];
  /** Search query */
  readonly searchQuery?: string;
  /** Sort field */
  readonly sortBy?: ScoutReportSortBy;
  /** Sort direction */
  readonly sortOrder?: SortOrder;
}

// ============================================
// PAGINATION TYPES
// ============================================

/**
 * Pagination information.
 */
export interface ScoutReportPagination {
  /** Current page (1-indexed) */
  readonly page: number;
  /** Items per page */
  readonly limit: number;
  /** Total items available */
  readonly total: number;
  /** Total pages available */
  readonly totalPages: number;
  /** Whether more pages exist */
  readonly hasMore: boolean;
}

// ============================================
// API RESPONSE TYPES
// ============================================

/**
 * Response for report list/feed requests.
 */
export interface ScoutReportListResponse {
  readonly success: boolean;
  readonly data?: ScoutReport[];
  readonly pagination?: ScoutReportPagination;
  readonly error?: string;
}

/**
 * Response for single report request.
 */
export interface ScoutReportDetailResponse {
  readonly success: boolean;
  readonly data?: ScoutReport;
  readonly error?: string;
}

/**
 * Response for view tracking.
 */
export interface ScoutReportViewResponse {
  readonly success: boolean;
  readonly viewCount?: number;
  readonly xpEarned?: number;
  readonly error?: string;
}

/**
 * Summary statistics for scout reports.
 */
export interface ScoutReportSummary {
  /** Total reports available */
  readonly totalReports: number;
  /** Reports by sport */
  readonly bySport: Record<AthleteSport, number>;
  /** Reports by graduation year */
  readonly byGradYear: Record<number, number>;
  /** New reports today */
  readonly newToday: number;
}

// ============================================
// STATE TYPES
// ============================================

/**
 * UI state for scout reports feature.
 */
export interface ScoutReportState {
  /** Current category */
  readonly activeCategory: ScoutReportCategoryId;
  /** Current reports */
  readonly reports: ScoutReport[];
  /** Applied filters */
  readonly filters: ScoutReportFilter;
  /** Pagination info */
  readonly pagination: ScoutReportPagination | null;
  /** Loading state */
  readonly isLoading: boolean;
  /** Loading more state */
  readonly isLoadingMore: boolean;
  /** Refreshing state */
  readonly isRefreshing: boolean;
  /** Error message */
  readonly error: string | null;
  /** View mode */
  readonly viewMode: 'grid' | 'list' | 'compact';
  /** Badge counts per category */
  readonly badges: Record<ScoutReportCategoryId, number>;
}

// ============================================
// XP & GAMIFICATION TYPES
// ============================================

/**
 * XP reward configuration for scout report actions.
 */
export interface ScoutReportXpReward {
  /** Action type */
  readonly action: 'view' | 'share' | 'complete-category' | 'milestone';
  /** XP amount */
  readonly xp: number;
  /** Description */
  readonly description: string;
}

/**
 * Achievement/Milestone for scout reports.
 */
export interface ScoutReportMilestone {
  /** Milestone ID */
  readonly id: string;
  /** Title */
  readonly title: string;
  /** Description */
  readonly description: string;
  /** Required count */
  readonly threshold: number;
  /** XP reward */
  readonly xpReward: number;
  /** Badge icon */
  readonly badgeIcon: string;
  /** Current progress */
  readonly progress?: number;
  /** Whether completed */
  readonly isCompleted?: boolean;
}

// ============================================
// LAYOUT TYPES
// ============================================

/**
 * View mode options.
 */
export type ScoutReportViewMode = 'grid' | 'list' | 'compact';

/**
 * Layout configuration.
 */
export interface ScoutReportLayoutConfig {
  /** View mode */
  readonly viewMode: ScoutReportViewMode;
  /** Columns for grid view (web) */
  readonly gridColumns: 2 | 3 | 4;
  /** Show quick stats on cards */
  readonly showQuickStats: boolean;
  /** Show rating breakdown on hover */
  readonly showRatingBreakdown: boolean;
  /** Enable swipe gestures */
  readonly enableSwipeGestures: boolean;
}
