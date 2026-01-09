/**
 * @fileoverview Common Types & Enums
 * @module @nxt1/core/models
 *
 * Shared type definitions used across the application.
 * Contains enums, utility types, and common interfaces.
 * 100% portable - no framework dependencies.
 *
 * @author NXT1 Engineering
 * @version 2.0.0
 */

/**
 * Timestamp type for portable date handling
 * At runtime, this could be a Firestore Timestamp, JS Date, or ISO string.
 * Services handle conversion; models stay Firebase-free.
 */
export type FirestoreTimestamp = {
  toDate(): Date;
  seconds: number;
  nanoseconds: number;
};

// ============================================
// PLAN TYPES
// ============================================

/**
 * Subscription plan types
 * Matches the original v1 PLANS enum for backward compatibility
 */
export enum PLANS {
  SUBSCRIPTION = 'subscription',
  MIN = 'minimal',
  MAX = 'maximal',
  TRIAL = 'trial',
}

// ============================================
// STAT TYPES
// ============================================

export type StatType = 'High School' | 'Club' | 'Middle School';

export type CompetitionLevel = 'Freshman' | 'JV' | 'Varsity';

export interface PrimarySportStat {
  year?: string;
  data: Record<string, unknown>;
  title?: string | null;
  statType?: StatType;
  competitionLevel?: CompetitionLevel;
  isRanked?: boolean;
}

export interface GameStat {
  game: string;
  data: Record<string, unknown>;
  date?: string | Date;
  year?: string;
  statType?: StatType;
  competitionLevel?: CompetitionLevel;
  isRanked?: boolean;
}

// ============================================
// CONTACT & SOCIAL TYPES
// ============================================

export interface SocialLinks {
  instagram?: string;
  twitter?: string;
  facebook?: string;
  youtube?: string;
}

export interface ContactInfo {
  phoneNumber?: string;
  email?: string;
  address?: string;
  city?: string;
  state?: string;
  zipCode?: string | number;
  fieldLocation?: string;
}

export interface TeamLinks {
  newsPageUrl?: string;
  schedulePageUrl?: string;
  registrationUrl?: string;
  customLinks?: TeamCustomLink[];
}

export interface TeamCustomLink {
  title: string;
  url: string;
}

// ============================================
// GAME & EVENT TYPES
// ============================================

export interface RecentGame {
  name?: string | null;
  date?: string | null;
  location?: string | null;
  time?: string | null;
  matchLocation?: string | null;
  gameLink?: string | null;
  matchType?: string | null;
  score1?: number | null;
  score2?: number | null;
  result?: string | null;
  opponentLogo?: string | null;
  year?: string | null;
}

export interface PersonalBest {
  personalBest?: string | null;
}

export interface Session {
  startTime?: Date | null;
  endTime?: Date | null;
}

export interface Award {
  award: string;
}

export interface UserEvent {
  date?: string | Date;
  eventLink?: string | null;
  eventType?: string | null;
  name?: string | null;
}

// ============================================
// SEASON RECORD
// ============================================

export interface SeasonRecord {
  wins: number;
  losses: number;
  ties?: number;
}

// ============================================
// PAYMENT TYPES
// ============================================

export interface PaymentInfo {
  expiresIn: FirestoreTimestamp | Date | string;
  firstYearExpiresIn: FirestoreTimestamp | Date | string;
}

export interface Referral {
  userId: string;
  date: Date;
  status: string;
}

// ============================================
// AI COPILOT USAGE
// ============================================

export interface AiCopilotUsage {
  dailyTaskCount: number;
  lastResetDate: string; // YYYY-MM-DD format
  totalTasksCompleted: number;
}

// ============================================
// TEAM CODE TRIAL
// ============================================

export interface TeamCodeTrial {
  id: string;
  expireAt: Date | string;
  isActive: boolean;
  expiredAt?: Date | string;
}

// ============================================
// VIDEO TYPES
// ============================================

export interface VideoParam {
  width?: number;
  height?: number;
  videoWidth?: number;
  videoHeight?: number;
  fps?: number;
  outputFileName?: string;
  maxDurationSeconds?: number | string;
  speedMultiplicator?: string | number;
  aspectRatio?: string;
}

export interface GameClip {
  clips?: unknown[];
  lastUpdated?: Date | string;
  params?: VideoParam;
}

export interface GameClipsCollection {
  [key: string]: GameClip;
}

// ============================================
// LEGACY TYPE ALIASES (for backward compatibility)
// ============================================

/** @deprecated Use PrimarySportStat instead */
export type primarySportStat = PrimarySportStat;

/** @deprecated Use RecentGame instead */
export type recentGame = RecentGame;

/** @deprecated Use PersonalBest instead */
export type personalBest = PersonalBest;
