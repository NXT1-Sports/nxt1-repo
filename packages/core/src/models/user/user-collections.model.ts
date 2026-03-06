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
 * - playerStats — Season stats (sportId required)
 * - gameStats — Game-by-game stats (sportId required)
 * - rankingEntries — Rankings (sportId required)
 * - offers — Scholarship offers (sportId required)
 * - interactions — Recruiting activities (sportId required)
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

export type PostVisibilityType = 'public' | 'followers' | 'private';

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
 * One document per stat field per season per player per sport.
 * Extends VerifiedStat with the required top-level sportId / userId fields
 * so the collection can be queried globally.
 *
 * ⭐ sportId required — stats always belong to a specific sport ⭐
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
// OFFERS (College Scholarship Offers)
// ============================================

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
// INTERACTIONS (Recruiting Activities)
// ============================================

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
// FOLLOWS (Follow Relationships)
// ============================================

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
