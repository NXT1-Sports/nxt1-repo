/**
 * @fileoverview User Sport Profile Types
 * @module @nxt1/core/models/user
 *
 * SportProfile and all related types (metrics, stats, recruiting, schedule).
 * These types support sport-based filtering across Timeline, Posts, News, etc.
 *
 * @author NXT1 Engineering
 * @version 2.0.0
 */

import type { ScholarshipType, CommitmentStatus, VisitType } from '../../constants/user.constants';
import type { DataSource, TeamInfo, CoachContact } from './user-base.model';

// ============================================
// AGENT X / SCOUTING
// ============================================

/** Player archetype assigned by Agent X */
export interface PlayerArchetype {
  /** Archetype name (e.g., 'Floor General', 'Pocket Passer') */
  name: string;
  /** Badge representing the archetype */
  badge: string;
  /** Short description */
  description: string;
}

/** Agent X trait analysis */
export interface AgentXTrait {
  /** Trait name */
  name: string;
  /** Detailed description */
  description?: string;
  /** Confidence score (0-1) */
  confidence?: number;
}

// ============================================
// VERIFIED METRIC (2026 Agentic Architecture)
// ============================================

/**
 * A single verified athletic measurement / combine metric.
 * Replaces the old `AthleticMetrics` Record<string, any>.
 *
 * Self-describing: the UI renders directly from `label` + `value` + `unit`
 * without needing to know the sport or parse camelCase keys.
 *
 * Stored on SportProfile.verifiedMetrics (lean subset) and in
 * sub-collection users/{uid}/sports/{sportId}/metrics/{metricId}
 * for full history.
 */
export interface VerifiedMetric {
  /** Unique identifier (e.g., 'forty_yard_dash_2025-06-15') */
  id: string;
  /** Machine key matching FieldDefinition.field (e.g., '40_yard_dash') */
  field: string;
  /** Display-ready label (e.g., '40-Yard Dash') */
  label: string;
  /** Metric value */
  value: string | number;
  /** Unit of measurement (e.g., 's', 'lbs', 'in', 'ft', 'mph') */
  unit?: string;
  /** Grouping category (e.g., 'speed', 'strength', 'agility', 'physical') */
  category?: string;
  /** Where this data came from */
  source: DataSource;
  /** Whether this metric has been verified by a trusted source */
  verified: boolean;
  /** Who/what verified it (e.g., 'MaxPreps', 'PrepSports Regional Combine') */
  verifiedBy?: string;
  /** When the metric was recorded/measured */
  dateRecorded?: Date | string;
  /** When this record was last updated */
  updatedAt?: Date | string;
}

// ============================================
// VERIFIED STAT (2026 Agentic Architecture)
// ============================================

/**
 * A single verified game/season statistic.
 * Replaces the old `SeasonStats.stats` Record<string, any>.
 *
 * Self-describing: the UI renders directly from `label` + `value`
 * without needing to know the sport.
 *
 * Stored in sub-collection:
 *   users/{uid}/sports/{sportId}/stats/{statId}
 *
 * Agent X curates the top stats onto SportProfile.featuredStats
 * for instant profile page loads.
 */
export interface VerifiedStat {
  /** Unique identifier */
  id: string;
  /** Machine key matching FieldDefinition.field (e.g., 'passing_yards') */
  field: string;
  /** Display-ready label (e.g., 'Passing Yards') */
  label: string;
  /** Stat value */
  value: string | number;
  /** Unit (if applicable, e.g., 'yds', 'avg') */
  unit?: string;
  /** Grouping category (e.g., 'offense', 'defense', 'special_teams') */
  category?: string;
  /** Season identifier (e.g., '2025-2026') */
  season?: string;
  /** Where this data came from */
  source: DataSource;
  /** Whether this stat has been verified by a trusted source */
  verified: boolean;
  /** Who/what verified it */
  verifiedBy?: string;
  /** Date the stat was recorded */
  dateRecorded?: Date | string;
  /** When this record was last updated */
  updatedAt?: Date | string;
}

// ============================================
// SCHEDULE EVENT (2026 Agentic Architecture)
// ============================================

/**
 * A scheduled event on the athlete's calendar.
 * Agnostic container — supports games, camps, visits, tournaments, etc.
 *
 * Stored in sub-collection:
 *   users/{uid}/schedule/{eventId}
 *
 * Agent X pins upcoming events onto SportProfile.upcomingEvents
 * for instant profile page loads.
 *
 * ⭐ sportId field enables filtering events by sport ⭐
 */
export interface ScheduleEvent {
  /** Unique identifier */
  id: string;
  /** Event type */
  eventType: 'game' | 'scrimmage' | 'practice' | 'playoff' | 'other';
  /** Event title (e.g., 'vs. Mater Dei', 'Rivals Underclassmen Camp') */
  title: string;
  /** Event date (ISO string) */
  date: Date | string;
  /** End date (for multi-day events) */
  endDate?: Date | string;
  /** Location */
  location?: string;
  /** Opponent (for games) */
  opponent?: string;
  /** Game result (e.g., 'W 24-14') */
  result?: string;
  /** URL for event details */
  url?: string;
  /** Logo/image URL */
  logoUrl?: string;
  /** Where this event data came from */
  source: DataSource;
  /** Agent X notes about the athlete's performance */
  agentXNotes?: string;
  /** ⭐ Sport this event belongs to (for filtering multi-sport athletes) ⭐ */
  sport?: string;
}

// ============================================
// RECRUITING ACTIVITY (unified — 2026 architecture)
// ============================================

/**
 * All recruiting activity categories.
 * Each profile tab (Offers, Visits, Camps, etc.) is a filtered view
 * on a single `category` field — one collection, one type, N tabs.
 */
export type RecruitingCategory = 'offer' | 'interest' | 'visit' | 'camp' | 'commitment' | 'contact';

/**
 * A single recruiting activity entry.
 *
 * Stored in Firestore sub-collection:
 *   users/{uid}/recruiting/{activityId}
 *
 * Replaces the old CollegeOffer, CollegeInteraction, and Commitment
 * interfaces with a single unified type. Each profile tab is a query
 * filtered by `category`.
 *
 * ⭐ sport field enables filtering recruiting by sport ⭐
 */
export interface RecruitingActivity {
  /** Unique identifier */
  id: string;
  /** Which tab/category this activity belongs to */
  category: RecruitingCategory;

  // ── College info (shared across all categories) ──
  /** College/program ID */
  collegeId: string;
  /** College/program name */
  collegeName: string;
  /** College logo URL */
  collegeLogoUrl?: string;
  /** Division (D1, D2, D3, NAIA, JUCO) */
  division?: string;
  /** Conference */
  conference?: string;
  /** City */
  city?: string;
  /** State */
  state?: string;
  /** ⭐ Sport this activity is associated with ⭐ */
  sport: string;

  // ── Timing ──
  /** When the activity occurred (ISO string) */
  date: Date | string;
  /** End date for multi-day events (camps, visits) */
  endDate?: Date | string;

  // ── Offer-specific ──
  /** Scholarship type (only for category: 'offer') */
  scholarshipType?: ScholarshipType;

  // ── Visit-specific ──
  /** Visit type (only for category: 'visit') */
  visitType?: VisitType;

  // ── Commitment-specific ──
  /** Commitment status (only for category: 'commitment') */
  commitmentStatus?: CommitmentStatus;
  /** When the commitment was publicly announced */
  announcedAt?: Date | string;

  // ── Coach contact ──
  /** Name of the coach involved */
  coachName?: string;
  /** Coach's title */
  coachTitle?: string;

  // ── Meta ──
  /** User notes */
  notes?: string;
  /** Graphic/image URL (offer graphic, commitment graphic, etc.) */
  graphicUrl?: string;
  /** Where this data came from */
  source: DataSource;
  /** Whether this entry has been verified (by Agent X or staff) */
  verified?: boolean;
  /** Created timestamp */
  createdAt: Date | string;
  /** Updated timestamp */
  updatedAt?: Date | string;
}

/**
 * Lean recruiting summary stored on SportProfile.
 * Full activity data lives in users/{uid}/recruiting/{activityId} sub-collection.
 * Backend keeps counts in sync via Cloud Functions.
 */
export interface RecruitingSummary {
  /** Whether the athlete is committed */
  isCommitted?: boolean;
  /** College name (if committed) */
  committedTo?: string;
  /** College logo URL (if committed) */
  committedLogoUrl?: string;
  /** Commitment date (if committed) */
  committedAt?: Date | string;
  /** Commitment status (if committed) */
  commitmentStatus?: CommitmentStatus;
  /** Target recruitment level (D1, D2, D3, NAIA, JUCO) */
  level?: string;
  /** Denormalized count of offers (synced from sub-collection) */
  offerCount?: number;
  /** Denormalized count of interests (synced from sub-collection) */
  interestCount?: number;
  /** Denormalized count of visits (synced from sub-collection) */
  visitCount?: number;
  /** Denormalized count of camps (synced from sub-collection) */
  campCount?: number;
  /** Player rating (1-5) */
  rating?: number;
  /** Who rated the player */
  ratedBy?: string;
  /** Recruiting tags/notes */
  tags?: string[];
}

// ============================================
// LEGACY TYPES (deprecated)
// ============================================

/**
 * @deprecated Use VerifiedMetric[] instead.
 * Athletic measurements and metrics as a flat key-value map.
 * Kept temporarily — existing reads may still use this shape.
 * Migration: convert to VerifiedMetric[] with label/value/source metadata.
 */
export type AthleticMetrics = Record<string, string | number | undefined>;

/**
 * @deprecated Use VerifiedStat[] in sub-collections instead.
 * Season statistics as a flat key-value map.
 * Migration: convert to VerifiedStat[] with full metadata.
 */
export interface SeasonStats {
  season: string;
  year: number;
  stats: Record<string, string | number>;
  gamesPlayed?: number;
}

/** Season record */
export interface SeasonRecord {
  wins: number;
  losses: number;
  ties?: number;
  season?: string;
}

// ============================================
// SPORT PROFILE
// ============================================

/**
 * Sport profile - contains all data for ONE sport
 * Array-based design supports unlimited sports
 *
 * ARCHITECTURE: Sub-collection principle applied.
 * Growing/unbounded data lives in Firestore sub-collections:
 *   users/{uid}/sports/{sportId}/metrics/{metricId}    — VerifiedMetric (full history)
 *   users/{uid}/sports/{sportId}/stats/{statId}        — VerifiedStat (all seasons)
 *   users/{uid}/recruiting/{activityId}                — RecruitingActivity (offers, visits, camps, commitments)
 *   users/{uid}/schedule/{eventId}                     — ScheduleEvent (games, camps, visits)
 *
 * Agent X curates lean summaries onto this document:
 *   featuredMetrics  — Top N most impressive metrics (instant UI load)
 *   featuredStats    — Top N most impressive stats (instant UI load)
 *   upcomingEvents   — Next 2-3 scheduled events (instant UI load)
 *
 * Only lean summaries and denormalized counts stay on this document.
 */
export interface SportProfile {
  /** Sport identifier (e.g., 'football', 'basketball mens') */
  sport: string;

  /** Display order (0 = primary) */
  order: number;

  /** Sport-specific bio */
  aboutMe?: string;

  /** Positions played (optional - added during profile completion) */
  positions?: string[];

  /** Jersey number */
  jerseyNumber?: string;
  yearsExperience?: number;

  /**
   * Team level / division for this sport (e.g. 'Varsity', 'JV', 'Freshman', '16U').
   * Used to scope team uniqueness: org + sport + level = a distinct squad.
   * Set during onboarding or profile edit; persisted on the Team document.
   */
  level?: string;

  /** Side preference (e.g., 'left', 'right', 'both') */
  side?: string[];

  /**
   * @deprecated Use verifiedMetrics instead.
   * Athletic measurements as flat key-value map.
   * Kept for backward compatibility with existing Firestore reads.
   */
  metrics?: AthleticMetrics;

  /**
   * Athletic measurements with full metadata (2026 Agentic Architecture).
   * Self-describing: each entry has label, value, unit, source, verified.
   * Replaces the old flat-map `metrics` field.
   */
  verifiedMetrics?: VerifiedMetric[];

  /**
   * Agent X curated "Top N" most impressive metrics for instant UI rendering.
   * Agent X automatically selects the best metrics and pins them here
   * so the profile page can render the hero section without sub-collection reads.
   * Backend keeps this in sync — frontend NEVER writes this directly.
   */
  featuredMetrics?: VerifiedMetric[];

  /**
   * Agent X curated "Top N" most impressive stats for instant UI rendering.
   * Same pattern as featuredMetrics — Agent X auto-selects from sub-collection.
   * Backend keeps this in sync — frontend NEVER writes this directly.
   */
  featuredStats?: VerifiedStat[];

  /**
   * Upcoming schedule events pinned by Agent X for instant UI rendering.
   * Agent X pulls the next 2-3 upcoming events from the schedule sub-collection.
   * Backend keeps this in sync — frontend NEVER writes this directly.
   */
  upcomingEvents?: ScheduleEvent[];

  /**
   * Player archetype assigned by Agent X (e.g., 'Floor General', 'Pocket Passer').
   * Backend keeps this in sync — frontend NEVER writes this directly.
   */
  archetype?: PlayerArchetype;

  /**
   * Agent X trait analysis for this sport profile.
   * Backend keeps this in sync — frontend NEVER writes this directly.
   */
  traits?: AgentXTrait[];

  /**
   * @deprecated V3: Team affiliation is now relational via RosterEntries collection.
   * Kept temporarily for backward compatibility with existing reads.
   * Migration: remove this field and use RosterEntries + organizationId instead.
   */
  team?: TeamInfo;

  /**
   * @deprecated V3: Club team is now relational via RosterEntries collection.
   * Kept temporarily for backward compatibility with existing reads.
   */
  clubTeam?: TeamInfo;

  /** Head coach contact */
  coach?: CoachContact;

  /**
   * Lean recruiting summary (denormalized from sub-collection).
   * Full offer/interaction data is in sub-collections.
   */
  recruiting?: RecruitingSummary;

  /** Season win/loss record */
  seasonRecord?: SeasonRecord;

  /** Primary highlight video */
  primaryVideo?: {
    url: string;
    thumbnailUrl?: string;
  };

  /** Created timestamp */
  createdAt?: Date | string;

  /** Updated timestamp */
  updatedAt?: Date | string;
}
