/**
 * @fileoverview User Global Firestore Collections
 * @module @nxt1/core/models/user
 *
 * Top-level, globally-queryable Firestore collections.
 * All collections support sportId filtering for multi-sport athletes.
 *
 * Collections:
 * - posts — Timeline/Posts (⭐ sportId for filtering)
 * - videos — Highlight reels (sportId required)
 * - playerStats — Season stats + game logs (sportId required)
 * - gameStats — Game-by-game stats (sportId required)
 * - rankingEntries — Rankings (sportId required)
 * - recruiting — Offers, visits, interest, camps, commitments (sportId required)
 * - scoutReports — Scouting evaluations (sportId required)
 * - follows — Follow relationships
 * - userSports — Sport enrollment index
 *
 * @author NXT1 Engineering
 * @version 2.0.0
 */

import type { VisitType } from '../../constants/user.constants';
import type { DataSource } from './user-base.model';
import type { VerifiedStat } from './user-sport.model';

// ============================================
// BASE TYPES
// ============================================

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

// ============================================
// POSTS (Timeline / Feed)
// ============================================

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

export type PostVisibilityType = 'public' | 'private';

/**
 * Top-level Firestore document: posts/{postId}
 *
 * ⭐ sportId enables sport-based filtering on /profile timeline ⭐
 *
 * Queryable by:  userId, sportId, season, createdAt
 */
export interface PostDoc extends UserFirestoreDoc {
  content: string;
  type: PostType;
  visibility: PostVisibilityType;
  /** ⭐ Sport context — filter posts by sport ⭐ */
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

// ============================================
// VIDEOS (Highlight Reels)
// ============================================

export type VideoDocType = 'highlight' | 'film' | 'training' | 'interview';

/**
 * Top-level Firestore document: videos/{videoId}
 *
 * ⭐ sportId required — videos always belong to a specific sport ⭐
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

// ============================================
// PLAYER STATS (Season Stats)
// ============================================

/**
 * Top-level Firestore document: playerStats/{statId}
 *
 * One document per season per player per sport.
 * All stat fields for a season are stored in the `stats` array — a single
 * Firestore read returns the full season stat line. This avoids fan-out
 * multi-reads and the 1-write-per-second-per-document limit during live
 * stat updates.
 *
 * Document ID convention: `${userId}_${sportId}_${season}`
 * guarantees one canonical document per player/sport/season and makes
 * upserts idempotent.
 *
 * ⭐ sportId required — stats always belong to a specific sport ⭐
 *
 * Queryable by:  userId, sportId, season, position, source, createdAt
 */
export interface PlayerStatDoc extends SportFirestoreDoc {
  /** Season identifier, e.g. '2025-2026'. */
  season: string;
  /** Position the stats apply to, e.g. 'QB', 'Point Guard'. */
  position?: string;
  /** All stat entries for this season (self-describing — label + value + unit). */
  stats: Pick<
    VerifiedStat,
    'field' | 'label' | 'value' | 'unit' | 'category' | 'verified' | 'verifiedBy' | 'dateRecorded'
  >[];
  /**
   * Full game-by-game tables (columns, game entries, totals) in the
   * ProfileSeasonGameLog format consumed by the Profile Stats UI.
   * Multiple categories (e.g. Passing, Rushing) per season are stored here.
   */
  gameLogs?: Record<string, unknown>[];
  /** Primary data source for this stat document. */
  source: DataSource;
  verified: boolean;
}

// ============================================
// GAME STATS (Game-by-Game Stats)
// ============================================

/**
 * Top-level Firestore document: gameStats/{gameStatId}
 *
 * One document per game per player per sport.
 *
 * ⭐ sportId required — game stats always belong to a specific sport ⭐
 *
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

// ============================================
// RANKING ENTRIES
// ============================================

export type RankingCategory = 'state' | 'national' | 'regional' | 'position';

/**
 * Top-level Firestore document: rankingEntries/{rankingEntryId}
 *
 * One document per ranking source per scope per player.
 *
 * ⭐ sportId required — rankings always belong to a specific sport ⭐
 *
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

// ============================================
// RECRUITING — OFFERS (category: 'offer')
// ============================================

export type OfferScholarshipType = 'full' | 'partial' | 'walk-on' | 'preferred-walk-on';
export type OfferDivision = 'D1' | 'D2' | 'D3' | 'NAIA' | 'JUCO';

/**
 * Top-level Firestore document: Recruiting/{docId} (category: 'offer')
 *
 * Stores college scholarship offers in the unified Recruiting collection.
 * Discriminated by `category: 'offer'`. Enables cross-user queries like
 * "all D1 football offers in California for class of 2026".
 *
 * ⭐ sportId required — offers always belong to a specific sport ⭐
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

// ============================================
// RECRUITING — INTERACTIONS (category: 'interest' | 'contact' | 'visit' | 'camp' | 'questionnaire')
// ============================================

export type RecruitingInteractionCategory =
  | 'interest'
  | 'contact'
  | 'visit'
  | 'camp'
  | 'questionnaire';

/**
 * Top-level Firestore document: Recruiting/{docId} (non-offer categories)
 *
 * Stores recruiting interactions (interest, contact, visit, camp) in the
 * unified Recruiting collection. Discriminated by `category` field.
 * Distinct from offers — covers all non-offer recruiting touchpoints.
 *
 * ⭐ sportId required — interactions always belong to a specific sport ⭐
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

// ============================================
// SCOUT REPORTS
// ============================================

export type ScoutReportGrade = 'A+' | 'A' | 'A-' | 'B+' | 'B' | 'B-' | 'C+' | 'C' | 'C-';

/**
 * Top-level Firestore document: scoutReports/{reportId}
 *
 * Scouting reports written by coaches / scouts about athletes.
 * Global collection enables queries like "all reports for athletes in Florida".
 *
 * ⭐ sportId required — reports always belong to a specific sport ⭐
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

// ============================================
// USER SPORTS (Global Sport Enrollment Index)
// ============================================

/**
 * Top-level Firestore document: userSports/{userSportId}
 *
 * Global index of athlete sport enrollments.
 * Enables cross-user discovery queries such as:
 *   "all football athletes in California, class of 2026"
 *   "all athletes playing basketball at D1 intent"
 *
 * ⭐ sportId required — this IS the sport enrollment record ⭐
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

// ============================================
// XP ENTRIES (Private Sub-Collection)
// ============================================

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
