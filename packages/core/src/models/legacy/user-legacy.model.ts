/**
 * @fileoverview Legacy User Model Types
 * @module @nxt1/core/models/legacy
 *
 * These types exist for backward compatibility with older Firestore documents
 * and legacy code paths. They should NOT be used in new code.
 *
 * Migration guide:
 * - StatData          → Record<string, string | number | boolean>
 * - SportInfo         → Record<string, string | number | boolean | null>
 * - primarySportStat  → SeasonStats from SportProfile
 * - GameStat          → GameStats from SportProfile
 * - LegacyCollege     → CollegeOffer or CollegeInteraction
 * - College           → CollegeOffer or CollegeInteraction
 * - CollegeVisits     → CollegeInteraction
 * - CollegeCamp       → CollegeInteraction
 * - recentGame        → recentGames[] in SportProfile
 * - Award             → awards[] in SportProfile (string[])
 * - personalBest      → personalBests[] in SportProfile
 * - PlayerTag         → sports[0].recruiting.tags (string[])
 * - Event             → schedule in SportProfile
 * - Session           → (unused - remove from new data)
 * - TeamCustomLink    → (unused - remove from new data)
 * - OwnTemplate       → UserMedia collection
 * - OwnMixtape        → UserMedia collection
 * - OwnProfile        → UserMedia collection
 * - UserPost          → Posts collection via userId
 * - GameClipsCollection → Prospect model
 * - TeamCode (user)   → team-code.model.ts
 *
 * @author NXT1 Engineering
 * @version 2.0.0 — extracted from user.model.ts
 */

// ============================================
// LEGACY STAT TYPES
// ============================================

/** @deprecated Use Record<string, string | number | boolean> instead */
export interface StatData {
  [key: string]: string | number | boolean;
}

/** @deprecated Use Record<string, string | number | boolean | null> instead */
export interface SportInfo {
  [key: string]: string | number | boolean | null;
}

// ============================================
// LEGACY STATS / SPORT DATA
// ============================================

/** @deprecated Use SeasonStats from SportProfile instead */
export interface primarySportStat {
  year?: string;
  data: StatData;
  title?: string | null;
  statType?: 'High School' | 'Club' | 'Middle School';
  competitionLevel?: 'Freshman' | 'JV' | 'Varsity';
  isRanked?: boolean;
}

/** @deprecated Use GameStats from SportProfile instead */
export interface GameStat {
  game: string;
  data: StatData;
  date?: string | Date;
  year?: string;
  statType?: 'High School' | 'Club' | 'Middle School';
  competitionLevel?: 'Freshman' | 'JV' | 'Varsity';
  isRanked?: boolean;
}

// ============================================
// LEGACY COLLEGE TYPES
// ============================================

/** @deprecated Use CollegeOffer or CollegeInteraction instead */
export interface LegacyCollege {
  _id?: string | null;
  'IPEDS/NCES_ID'?: string | null;
  city?: string | null;
  logoUrl?: string | null;
  name?: string | null;
  state?: string | null;
  visitDate?: string | null;
  sportInfo?: SportInfo;
}

/** @deprecated Use CollegeOffer or CollegeInteraction instead */
export type College = LegacyCollege;

/** @deprecated Use CollegeInteraction instead */
export type CollegeVisits = LegacyCollege & {
  visitType?: string | null;
  visitDate?: string | null;
};

/** @deprecated Use CollegeInteraction instead */
export type CollegeCamp = LegacyCollege & { visitDate?: string | null };

// ============================================
// LEGACY GAME / EVENT TYPES
// ============================================

/** @deprecated Use recentGames in SportProfile instead */
export interface recentGame {
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

/** @deprecated Use schedule in SportProfile instead */
export interface Event {
  date?: string | Date;
  eventLink?: string | null;
  eventType?: string | null;
  name?: string | null;
}

// ============================================
// LEGACY ACHIEVEMENTS
// ============================================

/** @deprecated Use awards[] (string[]) in SportProfile instead */
export interface Award {
  award: string;
}

/** @deprecated Use personalBests[] in SportProfile instead */
export interface personalBest {
  personalBest?: string | null;
}

// ============================================
// LEGACY RECRUITING
// ============================================

/** @deprecated Use sports[0].recruiting.tags (string[]) instead */
export interface PlayerTag {
  id: string;
  name: string;
  category?: string;
  value?: string | number;
}

// ============================================
// LEGACY USER DATA TYPES
// ============================================

/** @deprecated No replacement — remove from new data */
export interface Session {
  startTime?: Date | null;
  endTime?: Date | null;
}

/** @deprecated No replacement — remove from new data */
export interface TeamCustomLink {
  title: string;
  url: string;
}

/** @deprecated Use UserMedia collection instead */
export interface OwnTemplate {
  id: string | null;
  name: string | null;
  url: string | null;
  pngUrl?: string | null;
  type?: string | null;
  downloadURL?: string | null;
  previewImage?: string | null;
  order?: number | null;
  pinnedToProfile?: boolean | null;
  pinnedToTeamPage?: boolean | null;
  selectionOrder?: number;
  shareCount?: number | null;
  createdBy?: 'user' | 'system' | null;
  ownerName?: string | null;
  ownerId?: string | null;
  ownerProfileImg?: string | null;
}

/** @deprecated Use UserMedia collection instead */
export interface OwnMixtape {
  id: string | null;
  name: string | null;
  url?: string | null;
  type?: string | null;
  downloadURL?: string | null;
  previewImage?: string | null;
  order?: number | null;
  pinnedToProfile?: boolean | null;
  pinnedToTeamPage?: boolean | null;
  selectionOrder?: number;
  shareCount?: number | null;
  createdBy?: 'user' | 'system' | null;
  ownerName?: string | null;
  ownerId?: string | null;
  ownerProfileImg?: string | null;
}

/** @deprecated Use UserMedia collection instead */
export interface OwnProfile {
  id: string | null;
  name: string | null;
  url?: string | null;
  profileUrl?: string | null;
  pngUrl?: string | null;
  thumbnailUrl?: string | null;
  type?: string | null;
  downloadURL?: string | null;
  previewImage?: string | null;
  secondarySportPreviewImage?: string | null;
  order?: number | null;
  isLive?: boolean;
  shareCount?: number | null;
}

/** @deprecated Use Posts collection via userId instead */
export interface UserPost {
  id: string;
  userId?: string;
  title: string;
  description?: string;
  type: string;
  mediaUrl?: string;
  thumbnailUrl?: string;
  createdAt: Date | string;
  updatedAt?: Date | string;
  views: number;
  videoViews?: number;
  shares: number;
  reposts?: number;
  reactions?: number;
}

/** @deprecated Use Prospect model instead */
export interface GameClipsCollection {
  id: string;
  [key: string]: string | number | boolean | null | undefined;
}

/** @deprecated Use team-code.model.ts instead */
export interface LegacyTeamCode {
  id: string;
  code: string;
  teamName: string;
  [key: string]: string | number | boolean | null | undefined;
}
