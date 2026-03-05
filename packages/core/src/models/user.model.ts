/**
 * @fileoverview User Model
 * @module @nxt1/core/models
 *
 * Clean, composable user type definitions for the NXT1 platform.
 * 100% portable - no framework dependencies.
 *
 * Design Principles:
 * - Grouped by concern (identity, profile, sports, media, payment)
 * - Sports as array - supports unlimited sports, no duplication
 * - Role discriminator for type-safe role handling
 * - Single source for social/contact
 * - Types derived from constants (single source of truth)
 *
 * @author NXT1 Engineering
 * @version 2.0.0
 */

import type { PlanTier } from '../constants/payment.constants';
import {
  USER_ROLES,
  type UserRole,
  type AccountStatus,
  type Gender,
  type TeamType,
  type Theme,
  type ParentRelationship,
  type ScholarshipType,
  type CommitmentStatus,
  type VisitType,
  type AccountType,
  type DismissablePrompt,
} from '../constants/user.constants';

// ============================================
// SCHEMA VERSION
// ============================================

/** Current schema version for migration tracking */
export const USER_SCHEMA_VERSION = 2;

// ============================================
// LEGACY TYPES - Only import what is still referenced on User interface.
// Full legacy types live in ./legacy/user-legacy.model.ts (not re-exported).
// ============================================
import type { TeamCustomLink } from './legacy/user-legacy.model';

// TeamCode — imported from team-code model for use in the User interface
import type { TeamCode } from './team-code.model';
export type { TeamCode } from './team-code.model';

// ============================================
// LOCATION
// ============================================

/** Geographic location data */
export interface Location {
  address?: string;
  city: string;
  state: string;
  zipCode?: string;
  country: string;
}

// ============================================
// SOCIAL & CONTACT (legacy — still used by team-code.model & auth.routes)
// ============================================

/**
 * @deprecated Use SocialLink[] (agnostic array) instead.
 * Kept temporarily — team-code.model.ts and auth.routes.ts still reference this.
 */
export interface SocialLinks {
  twitter?: string | null;
  instagram?: string | null;
  tiktok?: string | null;
  hudl?: string | null;
  youtube?: string | null;
  maxPreps?: string | null;
  linkedin?: string | null;
}

/**
 * @deprecated Use a dedicated contact fields approach.
 * Kept temporarily — team-code.model.ts and auth.routes.ts still reference this.
 */
export interface ContactInfo {
  email: string;
  phone?: string | null;
}

// ============================================
// SOCIAL LINK (agnostic, array-based)
// ============================================

/**
 * Platform-agnostic social link.
 * Replaces hardcoded SocialLinks interface.
 * Stored as an array on User.social.
 */
export interface SocialLink {
  /** Platform identifier (e.g., 'twitter', 'instagram', 'hudl', 'maxpreps') */
  platform: string;
  /** Full URL to the social profile */
  url: string;
  /** Display username/handle (without @) */
  username?: string;
  /** Display order (lower = first) */
  displayOrder?: number;
  /** Whether this link has been verified by the platform or Agent X */
  verified?: boolean;
}

// ============================================
// CONNECTED SOURCES (Agent X sync)
// ============================================

/**
 * Agnostic connected source for Agent X AI sync.
 * Represents any external profile that is linked and scraped.
 * Platform is NOT hardcoded — supports any source.
 */
export interface ConnectedSource {
  /** Platform identifier (e.g., 'maxpreps', 'hudl', 'perfect-game') */
  platform: string;
  /** URL of the external profile */
  profileUrl: string;
  /** When Agent X last synced data from this source */
  lastSyncedAt?: Date | string;
  /** Current sync status */
  syncStatus?: 'idle' | 'syncing' | 'error' | 'success';
  /** Fields that were synced from this source (for auditability) */
  syncedFields?: string[];
  /** Error message if sync failed */
  lastError?: string;
}

// ============================================
// CONNECTED EMAIL (metadata only — tokens live in sub-collection)
// ============================================

// EmailProvider is defined in campaigns.model.ts ('gmail' | 'microsoft' | 'yahoo' | 'system')
import type { EmailProvider } from './campaigns.model';
export type { EmailProvider } from './campaigns.model';

/**
 * Connected email account metadata (stored on User doc).
 * Tokens are NEVER stored here — they live in:
 *   users/{uid}/emailTokens/{provider}
 *
 * This is the 2026 security best practice: User doc is readable by
 * many services; tokens should only be accessible to backend email services.
 */
export interface ConnectedEmail {
  /** Email address */
  email: string;
  /** Provider identifier */
  provider: EmailProvider;
  /** Whether this connection is currently active */
  isActive: boolean;
  /** When the account was connected */
  connectedAt: Date | string;
  /** Last time email was sent through this account */
  lastUsedAt?: Date | string;
  /** Last error (if any) — no sensitive details */
  lastError?: string;
  /** When last error occurred */
  lastErrorAt?: Date | string;
}

/**
 * OAuth token data for a connected email account.
 * Stored in Firestore sub-collection: users/{uid}/emailTokens/{provider}
 * NEVER stored on the User document.
 */
export interface EmailTokenData {
  /** Provider identifier */
  provider: EmailProvider;
  /** OAuth access token (encrypted at rest) */
  accessToken: string;
  /** OAuth refresh token (encrypted at rest) */
  refreshToken?: string;
  /** When the access token expires */
  tokenExpiresAt?: Date | string;
  /** When tokens were last refreshed */
  lastRefreshedAt?: Date | string;
}

// ============================================
// VERIFICATION
// ============================================

/** User verification status */
export type VerificationStatus = 'unverified' | 'pending' | 'verified' | 'premium';

// ============================================
// TEAM HISTORY
// ============================================

/**
 * A team affiliation entry (past or current)
 *
 * NEW in v3.0:
 * - For active memberships, query RosterEntries collection (source of truth)
 * - teamHistory is for display/historical purposes only
 * - rosterEntryId links to the RosterEntry document for this affiliation
 */
export interface TeamHistoryEntry {
  /** Team/school/club name */
  name: string;
  /** Team type */
  type: TeamType;
  /** Team logo URL */
  logoUrl?: string;
  /** Sport this team is for */
  sport?: string;
  /** Location */
  location?: Pick<Location, 'city' | 'state'>;
  /** Season record with this team */
  record?: {
    wins?: number;
    losses?: number;
    ties?: number;
  };
  /** When the athlete joined */
  startDate?: Date | string;
  /** When the athlete left (undefined = still active) */
  endDate?: Date | string;
  /** Whether this is the current team */
  isCurrent?: boolean;
  /**
   * NEW (v3.0): Reference to RosterEntry document ID
   * Use this to query for detailed team-specific data
   */
  rosterEntryId?: string;
  /**
   * NEW (v3.0): Reference to Team document ID
   */
  teamId?: string;
  /**
   * NEW (v3.0): Reference to Organization document ID
   */
  organizationId?: string;
}

// ============================================
// AWARDS
// ============================================

/** A user award/honor */
export interface UserAward {
  /** Award title (e.g., 'All-Conference First Team') */
  title: string;
  /** Category of the award (optional, free-form) */
  category?: string;
  /** Sport (if athletic award) */
  sport?: string;
  /** Season or year */
  season?: string;
  /** Issuing organization */
  issuer?: string;
  /** Date received */
  date?: Date | string;
}

// ============================================
// SPORT VERIFICATION
// ============================================

/**
 * Verification scope — which section of a profile is verified.
 * Open union supports known scopes + any future custom scope string.
 */
export type VerificationScope =
  | 'measurables'
  | 'stats'
  | 'recruiting'
  | 'schedule'
  | 'academics'
  | 'film'
  | (string & Record<never, never>);

/**
 * Agnostic section-level verification entry.
 * Any profile section (measurables, stats, recruiting, academics, film, etc.)
 * can be verified by any source.
 *
 * @example
 * { scope: 'measurables', verifiedBy: 'Rivals', sourceLogoUrl: '...', sourceUrl: '...' }
 * { scope: 'stats', verifiedBy: 'MaxPreps', sourceLogoUrl: '...', sourceUrl: '...' }
 */
export interface DataVerification {
  /** Which section this verification applies to */
  scope: VerificationScope;
  /** Who verified the data (e.g., 'Rivals', 'MaxPreps', '247Sports') */
  verifiedBy: string;
  /** Logo URL for the verification source (dynamic, not hardcoded) */
  sourceLogoUrl?: string;
  /** URL to the verification source page */
  sourceUrl?: string;
  /** When the verification was performed */
  verifiedAt?: Date | string;
  /** When this verification expires (optional) */
  expiresAt?: Date | string;
}

/**
 * @deprecated Use `DataVerification[]` with `VerificationScope` instead.
 * Verification info for a sport profile's data.
 */
export interface SportVerification {
  /** Who verified measurables (e.g., 'NXT1 Verified', 'Combine Results') */
  measurablesVerifiedBy?: string;
  /** URL to verification source */
  measurablesVerifiedUrl?: string;
  /** Who verified stats */
  statsVerifiedBy?: string;
  /** URL to stats verification source */
  statsVerifiedUrl?: string;
  /** When the verification occurred */
  verifiedAt?: Date | string;
}

// ============================================
// AGENT X / SCOUTING (source-of-truth types)
// Note: Display-only DTO versions exist in profile.types.ts
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
// RECRUITING SUMMARY (denormalized on SportProfile)
// ============================================

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
// ACADEMIC INFO
// ============================================

/** Academic information for athletes */
export interface AcademicInfo {
  gpa?: number;
  weightedGpa?: number;
  satScore?: number;
  actScore?: number;
  classRank?: number;
  classSize?: number;
  ncaaEligibilityCenter?: string;
  intendedMajor?: string;
}

// ============================================
// TEAM INFO
// ============================================

/** Team information (school/club) */
export interface TeamInfo {
  /** Team name (optional - user may not know it initially) */
  name?: string;
  type: TeamType;
  logo?: string | null;
  mascot?: string;
  colors?: string[];
  conference?: string;
  division?: string;
}

/** Coach contact for a sport */
export interface CoachContact {
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  title?: string;
}

// ============================================
// DATA SOURCE (shared across all verified data)
// ============================================

/**
 * Where a data point originated.
 * Fully agnostic for 2026+ integrations.
 *
 * Examples: 'maxpreps', 'hudl', 'agent-x', 'ncaa', custom partner IDs,
 * internal pipelines, and future providers not known at compile time.
 */
export type DataSource = string;

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
 */
export interface ScheduleEvent {
  /** Unique identifier */
  id: string;
  /** Event type */
  eventType: 'game' | 'camp' | 'visit' | 'tournament' | 'combine' | 'tryout' | 'practice' | 'other';
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
  /** Sport this event belongs to (for filtering multi-sport athletes) */
  sport?: string;
}

// ============================================
// SPORT PROFILE (legacy types — deprecated)
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

/**
 * @deprecated Use VerifiedStat[] + ScheduleEvent[] in sub-collections instead.
 * Game-by-game statistics as a flat key-value map.
 * Migration: convert to VerifiedStat[] per game + ScheduleEvent for the game itself.
 */
export interface GameStats {
  date: Date | string;
  opponent: string;
  stats: Record<string, string | number>;
  result?: 'win' | 'loss' | 'tie';
  score?: string;
}

/** Season record */
export interface SeasonRecord {
  wins: number;
  losses: number;
  ties?: number;
  season?: string;
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
  /** Sport this activity is associated with */
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

// ── Deprecated type aliases (backward compatibility) ──

/** @deprecated Use RecruitingActivity with category: 'offer' instead. */
export type CollegeOffer = RecruitingActivity;
/** @deprecated Use RecruitingActivity with category: 'interest' | 'visit' | 'camp' | 'contact' instead. */
export type CollegeInteraction = RecruitingActivity;
/** @deprecated Use RecruitingActivity with category: 'commitment' instead. */
export type Commitment = RecruitingActivity;

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

  /** Profile image specific to this sport */
  profileImg?: string | null;

  /** Sport-specific bio */
  aboutMe?: string;

  /** Positions played (optional - added during profile completion) */
  positions?: string[];

  /** Jersey number */
  jerseyNumber?: string;

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

  /** Team information - optional, added during profile completion */
  team?: TeamInfo;

  /** Club team (if different from high school) */
  clubTeam?: TeamInfo;

  /** Head coach contact */
  coach?: CoachContact;

  /** Account type for this sport (athlete, parent managing, coach) */
  accountType: AccountType;

  /**
   * Lean recruiting summary (denormalized from sub-collection).
   * Full offer/interaction data is in sub-collections.
   */
  recruiting?: RecruitingSummary;

  /** Schedule and events */
  schedule?: {
    /** Schedule page URL */
    url?: string;
    /** Upcoming event description */
    upcomingEvent?: string;
    /** Link to upcoming event */
    eventLink?: string;
  };

  /** Season win/loss record */
  seasonRecord?: SeasonRecord;

  /** Verification info for this sport's data */
  verification?: SportVerification;

  /**
   * Agnostic section-level verification entries.
   * Preferred over deprecated `verification` field.
   */
  verifications?: DataVerification[];

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

// ============================================
// PLAN TIER
// ============================================

/**
 * User's current plan tier.
 * Full subscription/billing details are in the Subscriptions collection.
 * @see payment.model.ts for Subscription, Transaction, UserEntitlements
 */
export type { PlanTier } from '../constants/payment.constants';

// ============================================
// USER PREFERENCES
// ============================================

/** Notification preferences */
export interface NotificationPreferences {
  push: boolean;
  email: boolean;
  sms?: boolean;
  marketing?: boolean;
}

/** User preferences and settings */
export interface UserPreferences {
  notifications: NotificationPreferences;
  activityTracking: boolean;
  /** Dismissed dialogs/tooltips */
  dismissedPrompts: DismissablePrompt[];
  /** Default sport to display (index in sports array) */
  defaultSportIndex: number;
  theme?: Theme;
  language?: string;
}

// ============================================
// COUNTERS
// ============================================

/**
 * Denormalized counters synced from analytics collection
 * Updated periodically by background sync job
 */
export interface UserCounters {
  profileViews: number;
  videoViews: number;
  followersCount: number;
  followingCount: number;
  postsCount: number;
  sharesCount: number;
  /** Number of highlight videos */
  highlightCount?: number;
  /** Total offers across all sports (denormalized) */
  offerCount?: number;
  /** Number of events attended */
  eventCount?: number;
  _lastSyncedAt?: Date | string;
}

// ============================================
// ROLE-SPECIFIC DATA
// ============================================

/**
 * Athlete-specific data
 * Personal info that applies across ALL sports the athlete plays.
 * Sport-specific data (positions, stats, team) goes in SportProfile[].
 */
export interface AthleteData {
  /** Academic information (GPA, test scores, etc.) */
  academics?: AcademicInfo;
  /** Parent/guardian contact info */
  parentInfo?: {
    name?: string;
    email?: string;
    phone?: string;
    relationship?: ParentRelationship;
  };
  /** NCAA/NAIA eligibility status */
  eligibilityStatus?: 'eligible' | 'pending' | 'ineligible';
  /** Eligibility center ID (NCAA Clearinghouse, etc.) */
  eligibilityId?: string;
}

/**
 * Coach-specific data
 * For high school, club, and travel team coaches.
 */
export interface CoachData {
  /** Job title (Head Coach, Assistant Coach, etc.) */
  title: string;
  /** Years of coaching experience */
  yearsExperience?: number;
  /** Coaching certifications */
  certifications?: string[];
  /** Can manage multiple teams under one account */
  canManageMultipleTeams?: boolean;
  /** Team codes this coach manages */
  managedTeamCodes?: string[];
  /** Sports this coach is involved with */
  coachingSports?: string[];
}

/**
 * College coach-specific data
 * @deprecated Use RecruiterData with recruiterType: 'college_coach' instead.
 * Kept for backward compatibility with existing Firestore documents.
 */
export interface CollegeCoachData extends CoachData {
  /** College/university name */
  institution: string;
  /** Athletic department */
  department?: string;
  /** Geographic recruiting regions */
  recruitingRegions?: string[];
  /** NCAA Division (D1, D2, D3) or NAIA, JUCO */
  division?: string;
  /** Conference affiliation */
  conference?: string;
}

/**
 * Recruiter-specific data (role: 'recruiter')
 * Consolidates college coaches, scouts, and recruiting services
 * into a single role with a sub-type discriminator.
 */
export interface RecruiterData {
  /** Discriminator: what kind of recruiter */
  recruiterType: 'college_coach' | 'independent_scout' | 'media_service';
  /** Job title (e.g., 'Head Coach', 'Scout', 'Recruiting Director') */
  title?: string;
  /** Organization/institution/company name */
  organization?: string;
  /** For college coaches: institution name */
  institution?: string;
  /** NCAA Division (D1, D2, D3) or NAIA, JUCO */
  division?: string;
  /** Conference affiliation */
  conference?: string;
  /** Sports they recruit for / evaluate / cover */
  sports?: string[];
  /** Geographic regions they cover */
  regions?: string[];
  /** Professional affiliations / credentials */
  affiliations?: string[];
  /** Business website (for recruiting services) */
  website?: string;
  /** Service offerings (for recruiting services) */
  services?: string[];
  /** Can manage multiple athlete clients */
  canManageAthletes?: boolean;
  /** Athlete UIDs they manage */
  managedAthleteIds?: string[];
  /** Years of experience */
  yearsExperience?: number;
}

/**
 * Director-specific data
 * For Directors, Program Directors, and administrators
 * who oversee multiple sports/programs organization-wide.
 */
export interface DirectorData {
  /** Job title (Director, Program Director, etc.) */
  title: string;
  /** Organization/school name */
  organization: string;
  /** Sports/programs they oversee (empty = all sports) */
  overseeSports?: string[];
  /** Team codes under their organization */
  organizationTeamCodes?: string[];
  /** Administrative capabilities */
  permissions?: {
    canManageCoaches?: boolean;
    canManageTeams?: boolean;
    canViewAllAthletes?: boolean;
    canManageBilling?: boolean;
  };
  /** Years in administrative role */
  yearsExperience?: number;
}

/**
 * Scout-specific data
 * For professional scouts evaluating athletes.
 */
export interface ScoutData {
  /** Organization/agency name */
  organization?: string;
  /** Sports they scout */
  scoutingSports?: string[];
  /** Geographic regions they cover */
  regions?: string[];
  /** Professional affiliations */
  affiliations?: string[];
}

/**
 * Recruiting Service-specific data
 * For professional recruiting services helping athletes get recruited.
 * Similar to a scout but focused on service delivery to athletes/families.
 */
export interface RecruitingServiceData {
  /** Company/service name */
  companyName: string;
  /** Business website */
  website?: string;
  /** Sports they specialize in */
  specialtySports?: string[];
  /** Geographic regions they serve */
  serviceRegions?: string[];
  /** Service offerings (e.g., 'video editing', 'college matching', 'camp placement') */
  services?: string[];
  /** Years in business */
  yearsInBusiness?: number;
  /** Can manage multiple athlete clients */
  canManageAthletes?: boolean;
  /** Athlete UIDs they manage */
  managedAthleteIds?: string[];
}

/**
 * Media-specific data
 * For journalists, content creators, photographers.
 */
export interface MediaData {
  /** Media outlet/organization */
  outlet?: string;
  /** Type of media coverage */
  mediaType?: 'journalist' | 'photographer' | 'videographer' | 'blogger' | 'podcaster';
  /** Sports they cover */
  coversSports?: string[];
  /** Press credentials */
  credentials?: string;
}

/**
 * Parent-specific data
 * For parents/guardians managing athlete profiles.
 */
export interface ParentData {
  /** UIDs of athletes they manage */
  managedAthleteIds?: string[];
  /** Relationship to athlete(s) */
  relationship?: ParentRelationship;
}

/**
 * Fan-specific data
 * For fans following athletes and teams.
 */
export interface FanData {
  /** Team codes or IDs they follow */
  followedTeams?: string[];
  /** Athlete UIDs they follow */
  followedAthletes?: string[];
  /** Colleges they're interested in */
  favoriteColleges?: string[];
  /** Sports they're interested in */
  favoriteSports?: string[];
}

// ============================================
// MAIN USER INTERFACE
// ============================================

/**
 * User - Main user interface for NXT1 platform
 * Combines all fields from legacy system with new architecture
 * Design principles:
 * 1. Grouped by concern (identity, profile, sports, media, subscription)
 * 2. Sports as array - no primary/secondary duplication
 * 3. Role discriminator for type-safe role handling
 * 4. Single source for social/contact
 * 5. Preferences replace boolean flags
 */
export interface User {
  // ============================================
  // CORE IDENTITY (required)
  // ============================================
  id: string;
  email: string;
  emailVerified?: boolean;
  firstName: string;
  lastName: string;
  /** Preferred display name (if different from firstName + lastName) */
  displayName?: string;
  username: string;

  /** Optional bio/about text */
  aboutMe?: string;

  /** Profile image URL */
  profileImg?: string | null;

  /** Banner/cover image URL */
  bannerImg?: string | null;

  /** Profile images for carousel display (max enforced by backend) */
  profileImages?: string[];

  /**
   * Unique profile identifier used for shareable URLs and QR codes.
   * e.g. 'JD-2026-FB' — assigned during onboarding.
   */
  unicode?: string | null;

  /**
   * User's gender (inclusive options).
   * @see GENDERS in @nxt1/core/constants for valid values
   */
  gender?: Gender;

  // ============================================
  // VERIFICATION
  // ============================================
  /** Verification status (unverified, pending, verified, premium) */
  verificationStatus?: VerificationStatus;

  // ============================================
  // PHYSICAL ATTRIBUTES (top-level for quick access)
  // ============================================
  /** Height (e.g., '6\'2"' or '188cm') */
  height?: string;
  /** Weight (e.g., '185 lbs' or '84kg') */
  weight?: string;

  // ============================================
  // CLASS / GRADUATION (top-level, source of truth)
  // ============================================
  /**
   * Graduation year (e.g., 2027).
   * Previously on AthleteData.classOf — moved here for top-level access.
   */
  classOf?: number;

  // ============================================
  // ROLE & STATUS
  // ============================================
  role?: UserRole;
  status?: AccountStatus;

  // ============================================
  // SPORTS (new architecture - use this)
  // ============================================
  /** Array of sport profiles - unlimited sports support */
  sports?: SportProfile[];
  /** Currently active sport index in sports array */
  activeSportIndex?: number;

  // ============================================
  // LOCATION & CONTACT (structured)
  // ============================================
  location?: Location;
  contact?: ContactInfo;

  /**
   * Social links (agnostic, array-based).
   * Each entry is a platform-agnostic SocialLink.
   * Replaces the old hardcoded SocialLinks interface.
   */
  social?: SocialLink[];

  // ============================================
  // TEAM HISTORY
  // ============================================
  /** All team affiliations (past and current) */
  teamHistory?: TeamHistoryEntry[];

  // ============================================
  // AWARDS (all types — athletic, academic, leadership, community)
  // ============================================
  /**
   * User's awards/honors across all categories.
   * Consolidated from sports[].awards (removed) into a single array.
   */
  awards?: UserAward[];

  // ============================================
  // AGENT X AI PROFILE
  // ============================================
  /** Agent X AI-generated profile analysis */

  // ============================================
  // CONNECTED SOURCES (Agent X sync)
  // ============================================
  /** External profiles linked for Agent X AI sync (agnostic) */
  connectedSources?: ConnectedSource[];

  // ============================================
  // CONNECTED EMAIL ACCOUNTS
  // Metadata only — tokens live in users/{uid}/emailTokens/{provider}
  // ============================================
  /** Email accounts connected for campaigns/messaging */
  connectedEmails?: ConnectedEmail[];

  // ============================================
  // LEGACY: Connected email tokens (flat fields)
  // Written by old backend controllers + beforeUserCreate function.
  // Migration path: move to users/{uid}/emailTokens/{provider}
  // ============================================
  /** @deprecated Legacy — currently connected email address */
  connectedEmail?: string;
  /** @deprecated Legacy — Gmail OAuth refresh token */
  connectedGmailToken?: string;
  /** @deprecated Legacy — Microsoft OAuth refresh token */
  connectedMicrosoftToken?: string;
  /** @deprecated Legacy — Yahoo OAuth refresh token */
  connectedYahooToken?: string;

  // ============================================
  // PROFILE CODE (shareable link / QR)
  // ============================================
  /** Unique shareable profile code */
  profileCode?: string;

  // ============================================
  // ROLE-SPECIFIC DATA
  // Only ONE of these should be populated based on user's role.
  // Athletes also have sports[] for sport-specific data.
  // ============================================
  /** Athlete-specific data (academics, parent info) - role: 'athlete' */
  athlete?: AthleteData;
  /** HS/Club coach-specific data - role: 'coach' */
  coach?: CoachData;
  /** Athletic/Program director data - role: 'director' */
  director?: DirectorData;
  /** Recruiter data (college coach, scout, service) - role: 'recruiter' */
  recruiter?: RecruiterData;
  /** Parent-specific data - role: 'parent' */
  parent?: ParentData;

  // --- Legacy role data (backward compat for existing Firestore docs) ---
  /** @deprecated Use recruiter instead */
  collegeCoach?: CollegeCoachData;
  /** @deprecated Use recruiter instead */
  recruitingService?: RecruitingServiceData;
  /** @deprecated Use recruiter instead */
  scout?: ScoutData;
  /** @deprecated Removed role */
  media?: MediaData;
  /** @deprecated Removed role */
  fan?: FanData;

  // ============================================
  // ONBOARDING
  // ============================================
  /**
   * Whether user has completed onboarding wizard.
   * Once true, user has full access to the platform.
   */
  onboardingCompleted?: boolean;

  // ============================================
  // PREFERENCES
  // ============================================
  preferences?: UserPreferences;

  // ============================================
  // SUBSCRIPTION & PAYMENT
  // Note: Full payment/subscription data is in Subscriptions collection
  // planTier is cached here for quick access (synced from Subscriptions)
  // ============================================
  /**
   * Cached plan tier from Subscriptions collection.
   * Updated when subscription changes.
   * Use Subscriptions/{userId} for authoritative subscription state.
   * @see Subscriptions collection
   */
  planTier?: PlanTier;

  // ============================================
  // ANALYTICS & COUNTERS
  // ============================================
  _counters?: UserCounters;

  // ============================================
  // TIMESTAMPS
  // ============================================
  createdAt?: Date | string;
  updatedAt?: Date | string;
  lastLoginAt?: Date | string;

  // ============================================
  // PUSH NOTIFICATIONS
  // ============================================
  fcmToken?: string | null;

  // ============================================
  // SCHEMA VERSION
  // ============================================
  _schemaVersion?: typeof USER_SCHEMA_VERSION;

  // ============================================
  // TEAM CODE (non-deprecated, used by coaches)
  // ============================================
  /** Team code reference */
  teamCode?: TeamCode | string | null;
  /** Team code trial info */
  teamCodeTrial?: {
    id: string;
    expireAt: Date | string;
    isActive: boolean;
    expiredAt?: Date | string;
  };

  // ============================================
  // SUB-COLLECTIONS ARCHITECTURE
  // The following data lives in Firestore sub-collections,
  // NOT on this document. Listed here for reference:
  //
  //   users/{uid}/timeline/{postId}          — Timeline posts
  //   users/{uid}/videos/{videoId}           — Video highlights
  //   users/{uid}/news/{articleId}           — News articles
  //   users/{uid}/rankings/{rankingId}       — Rankings entries
  //   users/{uid}/scoutReports/{reportId}    — Scouting reports
  //   users/{uid}/schedule/{eventId}         — Schedule/events
  //   users/{uid}/xp/{entryId}              — XP & badges
  //   users/{uid}/followers/{userId}         — Follow relationships
  //   users/{uid}/following/{userId}         — Follow relationships
  //   users/{uid}/sports/{sportId}/gameStats/ — Game stats
  // ============================================

  /** Team links for coach pages */
  teamLinks?: {
    newsPageUrl?: string;
    schedulePageUrl?: string;
    registrationUrl?: string;
    customLinks?: TeamCustomLink[];
  };
}

// ============================================
// UTILITY TYPES
// ============================================

/** Minimal user representation for lists/cards */
export interface UserSummary {
  id: string;
  unicode?: string | null;
  firstName: string;
  lastName: string;
  displayName?: string;
  profileImg?: string | null;
  role?: UserRole;
  verificationStatus?: VerificationStatus;
  location?: Pick<Location, 'city' | 'state'>;
  primarySport?: string;
  primaryPosition?: string;
  classOf?: number;
  height?: string;
  weight?: string;
}

// ============================================
// TYPE GUARDS
// ============================================

/** Check if user is an athlete with athlete data populated */
export function isAthlete(user: User): boolean {
  return user.role === USER_ROLES.ATHLETE && !!user.athlete;
}

/** Check if user is a coach with coach data populated */
export function isCoach(user: User): boolean {
  return user.role === USER_ROLES.COACH && !!user.coach;
}

/** Check if user is a college coach with college coach data populated */
/** @deprecated Use isRecruiter() instead */
export function isCollegeCoach(user: User): boolean {
  return user.role === USER_ROLES.RECRUITER && !!(user.recruiter || user.collegeCoach);
}

/** Check if user is a recruiter (college coach, scout, or recruiting service) */
export function isRecruiter(user: User): boolean {
  return (
    user.role === USER_ROLES.RECRUITER &&
    !!(user.recruiter || user.collegeCoach || user.recruitingService || user.scout)
  );
}

/** Check if user is a director with director data populated */
export function isDirector(user: User): boolean {
  return user.role === USER_ROLES.DIRECTOR && !!user.director;
}

/** Check if user has completed onboarding */
export function isOnboarded(user: User): boolean {
  return user.onboardingCompleted === true;
}

/** Check if user is verified (verified or premium status) */
export function isVerified(user: User): boolean {
  return user.verificationStatus === 'verified' || user.verificationStatus === 'premium';
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/** Get primary sport (first in array or legacy primarySport) */
export function getPrimarySport(user: User): SportProfile | undefined {
  if (user.sports && user.sports.length > 0) {
    return user.sports.find((s) => s.order === 0) || user.sports[0];
  }
  return undefined;
}

/** Get the currently active sport (by activeSportIndex or fallback to first) */
export function getActiveSport(user: User): SportProfile | undefined {
  if (!user.sports || user.sports.length === 0) return undefined;
  const index = user.activeSportIndex ?? 0;
  return user.sports[index] ?? user.sports[0];
}

/** Find a sport by name (case-insensitive) */
export function getSportByName(user: User, sportName: string): SportProfile | undefined {
  return user.sports?.find((s) => s.sport.toLowerCase() === sportName.toLowerCase());
}

/** Check if user plays a specific sport */
export function playsSport(user: User, sportName: string): boolean {
  const lower = sportName.toLowerCase();
  return user.sports?.some((s) => s.sport.toLowerCase() === lower) ?? false;
}

/** Get total offers across all sports (from denormalized recruiting summary) */
export function getTotalOffers(user: User): number {
  if (!user.sports) return 0;
  return user.sports.reduce((total, sport) => total + (sport.recruiting?.offerCount ?? 0), 0);
}

/** Get all awards */
export function getAllAwards(user: User): UserAward[] {
  return user.awards ?? [];
}

/** Check if user has multiple sports */
export function isMultiSport(user: User): boolean {
  return (user.sports?.length ?? 0) > 1;
}

/** Check if user is committed to a college in any sport */
export function isCommitted(user: User): boolean {
  return user.sports?.some((s) => !!s.recruiting?.isCommitted) ?? false;
}

/** Get user's display name (displayName if set, otherwise firstName + lastName) */
export function getDisplayName(user: User): string {
  return user.displayName || `${user.firstName} ${user.lastName}`;
}

/** Get user's profile image URL */
export function getProfileImg(user: User): string | null {
  return user.profileImg ?? null;
}

/** Get user's banner image URL */
export function getBannerImg(user: User): string | null {
  return user.bannerImg ?? null;
}

/** Get all profile images for carousel display */
export function getProfileImages(user: User): string[] {
  return user.profileImages ?? [];
}

/**
 * @deprecated Use getProfileImages instead
 */
export function getGalleryImages(user: User): string[] {
  return getProfileImages(user);
}

/** Get a social link URL by platform name (case-insensitive) */
export function getSocialUrl(user: User, platform: string): string | undefined {
  if (!Array.isArray(user.social)) return undefined;
  return user.social.find((s) => s.platform.toLowerCase() === platform.toLowerCase())?.url;
}

/** Get user's graduation class year */
export function getClassOf(user: User): number | undefined {
  return user.classOf;
}

/** Get connected source by platform name */
export function getConnectedSource(user: User, platform: string): ConnectedSource | undefined {
  return user.connectedSources?.find((s) => s.platform.toLowerCase() === platform.toLowerCase());
}

// ============================================
// FIRESTORE COLLECTION MODELS
// ============================================
//
// Top-level, globally-queryable collections (scalable, production-ready):
//   posts            — public / followers posts
//   videos           — highlight & film clips
//   playerStats      — season stat snapshots per player per sport
//   gameStats        — per-game stat lines
//   rankingEntries   — athlete ranking entries (state / national)
//   offers           — college recruiting scholarship offers
//   interactions     — recruiting interactions (interest, contact, visit, camp)
//   scoutReports     — scouting reports from coaches / scouts
//   follows          — follower/following edge records
//   userSports       — athlete sport-profile enrollment (global index)
//
// User-private sub-collections (NOT globally queried):
//   users/{uid}/schedule/{eventId}  — already typed as ScheduleEvent above
//   users/{uid}/xp/{entryId}        — XP ledger entries
//
// Design rules applied to every top-level document:
//   • userId   — always present when document relates to a user
//   • sportId  — always present when document relates to a sport
//   • createdAt / updatedAt — always present
//   • Supports: filter by sportId, filter by season, order by rank/score/createdAt
//
// ============================================

// ─── Base types ───────────────────────────────────────────────────────────────

/**
 * Fields present on every Firestore document (top-level or sub-collection).
 * `id` mirrors the Firestore document ID so clients never need a second read.
 */
export interface FirestoreDoc {
  id: string;
  createdAt: Date | string;
  updatedAt: Date | string;
}

/** Extends FirestoreDoc for any document tied to a specific user. */
export interface UserFirestoreDoc extends FirestoreDoc {
  userId: string;
}

/** Extends UserFirestoreDoc for documents also scoped to a specific sport. */
export interface SportFirestoreDoc extends UserFirestoreDoc {
  /** Sport identifier, e.g. 'football', 'basketball'. */
  sportId: string;
}

// ─── posts  (top-level collection) ────────────────────────────────────────────

export type PostType =
  | 'update'
  | 'highlight'
  | 'milestone'
  | 'question'
  | 'media'
  | 'offer'
  | 'stat'
  | 'news'
  | 'text'
  | 'image'
  | 'video';

export type PostVisibilityType = 'public' | 'followers' | 'private';

/**
 * Top-level Firestore document: posts/{postId}
 *
 * Queryable by:  userId, sportId, season, createdAt
 */
export interface PostDoc extends UserFirestoreDoc {
  content: string;
  type: PostType;
  visibility: PostVisibilityType;
  /** Optional sport context — enables filtering posts by sport. */
  sportId?: string;
  /** Season tag, e.g. '2025-2026'. */
  season?: string;
  title?: string;
  images: string[];
  videoUrl?: string;
  thumbnailUrl?: string;
  /** Duration in seconds (for video posts). */
  durationSeconds?: number;
  mentions: string[];
  hashtags: string[];
  isPinned: boolean;
  commentsDisabled: boolean;
  stats: {
    likes: number;
    comments: number;
    shares: number;
    views: number;
  };
}

// ─── videos  (top-level collection) ───────────────────────────────────────────

export type VideoDocType = 'highlight' | 'film' | 'training' | 'interview';

/**
 * Top-level Firestore document: videos/{videoId}
 *
 * Queryable by:  userId, sportId, season, createdAt
 */
export interface VideoDoc extends SportFirestoreDoc {
  season?: string;
  title: string;
  description?: string;
  type: VideoDocType;
  url: string;
  thumbnailUrl?: string;
  durationSeconds?: number;
  /** Free-form tags for search and filtering. */
  tags: string[];
  isPublic: boolean;
  /** Hosting platform, e.g. 'hudl', 'youtube', 'nxt1'. */
  platform?: string;
  stats: {
    views: number;
    likes: number;
    shares: number;
  };
}

// ─── playerStats  (top-level collection) ──────────────────────────────────────

/**
 * Top-level Firestore document: playerStats/{statId}
 *
 * One document per stat field per season per player per sport.
 * Extends VerifiedStat with the required top-level sportId / userId fields
 * so the collection can be queried globally.
 *
 * Queryable by:  userId, sportId, season, category, field, createdAt
 */
export interface PlayerStatDoc extends SportFirestoreDoc {
  /** Season identifier, e.g. '2025-2026'. */
  season: string;
  /** Position the stats apply to, e.g. 'QB', 'Point Guard'. */
  position?: string;
  /** Machine key matching VerifiedStat.field, e.g. 'passing_yards'. */
  field: string;
  label: string;
  value: number | string;
  unit?: string;
  /** Grouping category, e.g. 'offense', 'defense'. */
  category?: string;
  source: DataSource;
  verified: boolean;
  verifiedBy?: string;
  dateRecorded?: Date | string;
}

// ─── gameStats  (top-level collection) ────────────────────────────────────────

/**
 * Top-level Firestore document: gameStats/{gameStatId}
 *
 * One document per game per player per sport.
 * Queryable by:  userId, sportId, season, gameDate, createdAt
 */
export interface GameStatDoc extends SportFirestoreDoc {
  season: string;
  /** ISO-8601 date string of the game. */
  gameDate: string;
  opponent?: string;
  location?: string;
  result?: string;
  /** Individual stat entries for this game. */
  stats: Pick<VerifiedStat, 'field' | 'label' | 'value' | 'unit' | 'category'>[];
  source: DataSource;
  verified: boolean;
}

// ─── rankingEntries  (top-level collection) ────────────────────────────────────

export type RankingCategory = 'state' | 'national' | 'regional' | 'position';

/**
 * Top-level Firestore document: rankingEntries/{rankingEntryId}
 *
 * One document per ranking source per scope per player.
 * Queryable by:  userId, sportId, season, category, rank, score, createdAt
 */
export interface RankingEntryDoc extends UserFirestoreDoc {
  sportId: string;
  season?: string;
  position?: string;
  category: RankingCategory;
  rank: number;
  totalAthletes: number;
  score: number;
  classOf?: number;
  state?: string;
  /** Ranking source, e.g. 'nxt1', '247sports', 'rivals'. */
  source: string;
}

// ─── offers  (top-level collection) ───────────────────────────────────────────

export type OfferScholarshipType = 'full' | 'partial' | 'walk-on' | 'preferred-walk-on';
export type OfferDivision = 'D1' | 'D2' | 'D3' | 'NAIA' | 'JUCO';

/**
 * Top-level Firestore document: offers/{offerId}
 *
 * Stores college scholarship offers as globally-queryable records.
 * (RecruitingActivity on the sub-collection stores the full history;
 * this top-level doc enables cross-user queries like
 * "all D1 football offers in California for class of 2026".)
 *
 * Queryable by:  userId, sportId, season, collegeId, division, offerDate, createdAt
 */
export interface OfferDoc extends UserFirestoreDoc {
  sportId: string;
  season?: string;
  collegeId: string;
  collegeName: string;
  division?: OfferDivision;
  conference?: string;
  city?: string;
  state?: string;
  scholarshipType?: OfferScholarshipType;
  /** ISO-8601 date the offer was received. */
  offerDate: string;
  coachName?: string;
  coachTitle?: string;
  notes?: string;
  verified: boolean;
  verifiedAt?: Date | string;
}

// ─── interactions  (top-level collection) ─────────────────────────────────────

export type RecruitingInteractionCategory =
  | 'interest'
  | 'contact'
  | 'visit'
  | 'camp'
  | 'questionnaire';

/**
 * Top-level Firestore document: interactions/{interactionId}
 *
 * Stores recruiting interactions (interest, contact, visit, camp) globally.
 * Distinct from offers — covers all non-offer recruiting touchpoints.
 *
 * Queryable by:  userId, sportId, season, category, collegeId, interactionDate, createdAt
 */
export interface InteractionDoc extends UserFirestoreDoc {
  sportId: string;
  season?: string;
  category: RecruitingInteractionCategory;
  collegeId: string;
  collegeName: string;
  division?: OfferDivision;
  city?: string;
  state?: string;
  /** ISO-8601 date of the interaction. */
  interactionDate: string;
  endDate?: string;
  visitType?: VisitType;
  coachName?: string;
  coachTitle?: string;
  notes?: string;
  source: DataSource;
  verified: boolean;
}

// ─── scoutReports  (top-level collection) ─────────────────────────────────────

export type ScoutReportGrade = 'A+' | 'A' | 'A-' | 'B+' | 'B' | 'B-' | 'C+' | 'C' | 'C-';

/**
 * Top-level Firestore document: scoutReports/{reportId}
 *
 * Scouting reports written by coaches / scouts about athletes.
 * Global collection enables queries like "all reports for athletes in Florida".
 *
 * Queryable by:  userId (athlete), sportId, season, scoutUserId, isPublic, createdAt
 */
export interface ScoutReportDoc extends FirestoreDoc {
  /** UID of the athlete being scouted. */
  userId: string;
  sportId: string;
  season?: string;
  /** UID of the scout / coach if they have a platform account. */
  scoutUserId?: string;
  scoutName: string;
  scoutOrganization?: string;
  position?: string;
  grade?: ScoutReportGrade;
  overallScore?: number;
  summary: string;
  strengths: string[];
  areasToImprove: string[];
  /**
   * Granular attribute scores keyed by field name.
   * e.g. { 'footwork': 85, 'arm_strength': 92 }
   */
  attributeScores?: Record<string, number>;
  isPublic: boolean;
  /** Whether the athlete has viewed this report. */
  athleteViewed: boolean;
}

// ─── follows  (top-level collection) ──────────────────────────────────────────

/**
 * Top-level Firestore document: follows/{followerId}_{followingId}
 *
 * Document ID convention: `${followerId}_${followingId}` — guarantees
 * global uniqueness and avoids duplicate edges.
 *
 * Both `followerId` and `followingId` are indexed, enabling:
 *   - "all followers of userId X": where('followingId', '==', X)
 *   - "all users userId X follows": where('followerId', '==', X)
 *
 * Queryable by:  followerId, followingId, createdAt
 */
export interface FollowDoc extends FirestoreDoc {
  /** UID of the user who is following. */
  followerId: string;
  /** UID of the user being followed. */
  followingId: string;
}

// ─── userSports  (top-level collection) ───────────────────────────────────────

/**
 * Top-level Firestore document: userSports/{userSportId}
 *
 * Global index of athlete sport enrollments.
 * Enables cross-user discovery queries such as:
 *   "all football athletes in California, class of 2026"
 *   "all athletes playing basketball at D1 intent"
 *
 * Queryable by:  userId, sportId, season, accountType, classOf, state, isActive, createdAt
 */
export interface UserSportDoc extends UserFirestoreDoc {
  sportId: string;
  season?: string;
  /** Display order / priority (0 = primary sport). */
  order: number;
  accountType: 'athlete' | 'coach' | 'parent' | 'recruiter' | 'director';
  positions?: string[];
  classOf?: number;
  state?: string;
  /** Denormalized display name for full-text / listing queries. */
  displayName?: string;
  avatarUrl?: string;
  isActive: boolean;
}

// ─── users/{uid}/xp  (private sub-collection) ─────────────────────────────────

/**
 * Sub-collection document: users/{uid}/xp/{entryId}
 *
 * Experience-point ledger — private to the athlete.
 * Each document records a single XP event (award or deduction).
 */
export interface XpEntryDoc extends UserFirestoreDoc {
  /** XP amount awarded (negative values = deductions). */
  amount: number;
  reason: string;
  /** Action that triggered the XP award, e.g. 'post_created'. */
  action: string;
  /** Optional reference to the related entity (post ID, video ID, etc.). */
  referenceId?: string;
  referenceType?: string;
  /** Running XP balance after this entry was applied. */
  balance: number;
}
