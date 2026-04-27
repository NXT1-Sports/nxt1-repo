/**
 * @fileoverview Distiller Types — Shared interfaces for platform-specific data extractors
 * @module @nxt1/backend/modules/agent/tools/integrations/firecrawl/scraping/distillers
 *
 * Distillers transform the raw, massive JSON blobs from sports platforms
 * (MaxPreps __NEXT_DATA__, Hudl __hudlEmbed, 247Sports, etc.) into clean,
 * compact TypeScript objects that the AI agent can consume without token overflow.
 *
 * Each distiller produces a DistilledProfile — a unified shape regardless of
 * which platform the data originated from.
 */

// ─── Section Types ──────────────────────────────────────────────────────────

export interface DistilledIdentity {
  readonly firstName?: string;
  readonly lastName?: string;
  readonly displayName?: string;
  readonly profileImage?: string;
  readonly bannerImage?: string;
  readonly aboutMe?: string;
  readonly height?: string;
  readonly weight?: string;
  readonly classOf?: number;
  readonly city?: string;
  readonly state?: string;
  readonly country?: string;
  readonly school?: string;
  readonly schoolLogoUrl?: string;
}

export interface DistilledAcademics {
  readonly gpa?: number;
  readonly weightedGpa?: number;
  readonly satScore?: number;
  readonly actScore?: number;
  readonly classRank?: number;
  readonly classSize?: number;
  readonly intendedMajor?: string;
}

export interface DistilledSportInfo {
  readonly sport: string;
  readonly positions?: string[];
  readonly jerseyNumber?: string | number;
  readonly side?: string;
}

export interface DistilledTeam {
  readonly name?: string;
  readonly type?: string;
  readonly mascot?: string;
  readonly conference?: string;
  readonly division?: string;
  readonly logoUrl?: string;
  readonly primaryColor?: string;
  readonly secondaryColor?: string;
  readonly city?: string;
  readonly state?: string;
  readonly country?: string;
  readonly seasonRecord?: string;
}

export interface DistilledCoach {
  readonly firstName: string;
  readonly lastName: string;
  readonly email?: string;
  readonly phone?: string;
  readonly title?: string;
}

export interface DistilledMetric {
  readonly field: string;
  readonly label: string;
  readonly value: string | number;
  readonly unit?: string;
  readonly category?: string;
}

export interface DistilledStatColumn {
  readonly key: string;
  readonly label: string;
  readonly abbreviation?: string;
}

export interface DistilledGameEntry {
  readonly date?: string;
  readonly opponent?: string;
  readonly opponentLogoUrl?: string;
  readonly result?: string;
  readonly values: Record<string, string | number>;
}

export interface DistilledSeasonStats {
  readonly season: string;
  readonly category: string;
  readonly columns: readonly DistilledStatColumn[];
  readonly games: readonly DistilledGameEntry[];
  readonly totals?: Record<string, string | number>;
  readonly averages?: Record<string, string | number>;
}

export interface DistilledScheduleEvent {
  readonly date: string;
  readonly opponent?: string;
  readonly opponentLogoUrl?: string;
  readonly location?: string;
  readonly homeAway?: 'home' | 'away' | 'neutral';
  readonly result?: string;
  readonly score?: string;
}

export interface DistilledVideo {
  readonly src: string;
  readonly provider: 'youtube' | 'hudl' | 'vimeo' | 'twitter' | 'other';
  readonly videoId?: string;
  readonly poster?: string;
  readonly title?: string;
}

export interface DistilledRecruitingActivity {
  readonly category: 'offer' | 'interest' | 'visit' | 'camp' | 'commitment';
  readonly collegeName?: string;
  readonly collegeLogoUrl?: string;
  readonly division?: string;
  readonly conference?: string;
  readonly city?: string;
  readonly state?: string;
  readonly sport?: string;
  readonly date?: string;
  readonly scholarshipType?: string;
  readonly coachName?: string;
  readonly coachTitle?: string;
  readonly notes?: string;
}

export interface DistilledAward {
  readonly title: string;
  readonly category?: string;
  readonly sport?: string;
  readonly season?: string;
  readonly issuer?: string;
  readonly date?: string;
}

// ─── Unified Profile ────────────────────────────────────────────────────────

/**
 * Sections available in a distilled profile.
 * Used by `scrape_and_index_profile` to report what was found.
 */
export type DistilledSectionKey =
  | 'identity'
  | 'academics'
  | 'sportInfo'
  | 'team'
  | 'coach'
  | 'metrics'
  | 'seasonStats'
  | 'schedule'
  | 'videos'
  | 'recruiting'
  | 'awards';

/**
 * The unified output of any platform distiller.
 * Every field is optional — distillers fill only what the platform provides.
 */
export type DistilledProfileType = 'athlete' | 'team' | 'organization';

export interface DistilledProfile {
  readonly platform: string;
  readonly profileUrl: string;
  readonly profileType?: DistilledProfileType;
  readonly identity?: DistilledIdentity;
  readonly academics?: DistilledAcademics;
  readonly sportInfo?: DistilledSportInfo;
  readonly team?: DistilledTeam;
  readonly coach?: DistilledCoach;
  readonly metrics?: readonly DistilledMetric[];
  readonly seasonStats?: readonly DistilledSeasonStats[];
  readonly schedule?: readonly DistilledScheduleEvent[];
  readonly videos?: readonly DistilledVideo[];
  readonly recruiting?: readonly DistilledRecruitingActivity[];
  readonly awards?: readonly DistilledAward[];
}

/**
 * Index / manifest returned to the agent — lightweight summary of what data exists.
 */
export interface DistilledProfileIndex {
  readonly platform: string;
  readonly profileUrl: string;
  readonly profileType?: DistilledProfileType;
  readonly availableSections: readonly DistilledSectionKey[];
  readonly summary: {
    readonly hasIdentity: boolean;
    readonly hasAcademics: boolean;
    readonly hasSportInfo: boolean;
    readonly hasTeam: boolean;
    readonly hasCoach: boolean;
    readonly metricsCount: number;
    readonly seasonsCount: number;
    readonly scheduleEventsCount: number;
    readonly videosCount: number;
    readonly recruitingActivitiesCount: number;
    readonly awardsCount: number;
  };
}

// ─── Distiller Interface ────────────────────────────────────────────────────

export interface PlatformDistiller {
  /** Platform identifier (e.g. 'maxpreps', 'hudl', '247sports'). */
  readonly platform: string;

  /**
   * Check whether this distiller can process a given URL or data blob.
   * Should be fast — regex or hostname check only.
   */
  canHandle(url: string, pageData: Record<string, unknown>): boolean;

  /**
   * Extract structured data from the raw page data.
   * Returns a DistilledProfile with all available sections populated.
   *
   * @param url - The original page URL.
   * @param pageData - Raw structured data from page-data-extractor
   *                    (nextData, embeddedData, ldJson, etc.).
   * @param markdownContent - The prose markdown for fallback extraction.
   */
  distill(
    url: string,
    pageData: Record<string, unknown>,
    markdownContent: string
  ): DistilledProfile;
}
