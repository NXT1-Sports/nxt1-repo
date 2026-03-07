/**
 * @fileoverview User Model (Main Interface)
 * @module @nxt1/core/models/user
 *
 * Main User interface + preferences + counters + utility functions.
 * Imports all sub-types from modular files.
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

import {
  USER_ROLES,
  type UserRole,
  type AccountStatus,
  type Gender,
  type Theme,
  type DismissablePrompt,
} from '../../constants/user.constants';
import type { PlanTier } from '../../constants/payment.constants';

// Import all sub-types
import type {
  USER_SCHEMA_VERSION,
  Location,
  ContactInfo,
  SocialLink,
  ConnectedSource,
  ConnectedEmail,
  VerificationStatus,
  TeamHistoryEntry,
  UserAward,
} from './user-base.model';
import type { SportProfile } from './user-sport.model';
import type {
  AthleteData,
  CoachData,
  CollegeCoachData,
  RecruiterData,
  DirectorData,
  ParentData,
  ScoutData,
  RecruitingServiceData,
  MediaData,
  FanData,
} from './user-role-data.model';

// Re-export for convenience
export { USER_SCHEMA_VERSION } from './user-base.model';
export type { SportProfile } from './user-sport.model';

// ============================================
// TEAM CODE (legacy import)
// ============================================

import type { TeamCode } from '../team-code.model';
export type { TeamCode } from '../team-code.model';

// Legacy types
import type { TeamCustomLink } from '../legacy/user-legacy.model';

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
  analyticsTracking: boolean;
  /** Biometric login enabled (Face ID / Touch ID) */
  biometricLogin?: boolean;

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
 *
 * ⭐ SPORT FILTERING ARCHITECTURE ⭐
 * All profile data (Timeline, Posts, Videos, Stats, News, Schedule, Recruiting)
 * can be filtered by sport via:
 * - PostDoc.sportId
 * - VideoDoc.sportId (required)
 * - PlayerStatDoc.sportId (required)
 * - GameStatDoc.sportId (required)
 * - RecruitingActivity.sport (required)
 * - ScheduleEvent.sport
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

  /** Banner/cover image URL */
  bannerImg?: string | null;

  /** Profile images for carousel display (multiple images, max enforced by backend) */
  profileImgs?: string[];

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
  // ⭐ KEY FOR SPORT-BASED FILTERING ⭐
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
  // ⭐ ALL SUPPORT sportId FILTERING ⭐
  //
  //   users/{uid}/timeline/{postId}          — Timeline posts (PostDoc.sportId)
  //   users/{uid}/videos/{videoId}           — Video highlights (VideoDoc.sportId required)
  //   users/{uid}/news/{articleId}           — News articles (sportId)
  //   users/{uid}/rankings/{rankingId}       — Rankings entries (sportId required)
  //   users/{uid}/scoutReports/{reportId}    — Scouting reports (sportId required)
  //   users/{uid}/schedule/{eventId}         — Schedule/events (ScheduleEvent.sport)
  //   users/{uid}/recruiting/{activityId}    — Recruiting (RecruitingActivity.sport required)
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
  profileImgs?: string[];
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
  return user.profileImgs?.[0] ?? null;
}

/** Get user's banner image URL */
export function getBannerImg(user: User): string | null {
  return user.bannerImg ?? null;
}

/** Get all profile images for carousel display */
export function getProfileImages(user: User): string[] {
  return user.profileImgs ?? [];
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
